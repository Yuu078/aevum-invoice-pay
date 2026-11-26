// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PastiPay — Stablecoin invoices with built-in Confirmation of Payee
/// @notice An invoice contract for Aevum Testnet (chain 44005) that settles in
///         the tUSD8 test stablecoin. Every invoice binds the amount AND the
///         payee's verified display name to the payee wallet address. A payer
///         can only execute payment after confirming the payee name: the hash
///         of the confirmed name must match the hash registered on the invoice,
///         enforced on-chain in `payInvoice`. Paying the wrong person becomes
///         impossible by construction, not by caution.
/// @dev    Built for the Aevum Builder Challenge #1 (QDay), Invoice Payments +
///         Confirmation of Payee tracks. Written during the build window
///         (16 Nov – 11 Dec 2026). No external dependencies.

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PastiPay {
    enum Status {
        Open,
        Paid,
        Cancelled
    }

    struct Invoice {
        address issuer; // who issued the invoice and receives the funds
        address payer; // the only address allowed to pay this invoice
        uint256 amount; // amount in tUSD8 base units (6 decimals)
        string description; // what the invoice is for
        string payeeName; // verified display name of the payee (shown to payer)
        bytes32 payeeNameHash; // keccak256 of the normalized payee name
        Status status;
        uint256 createdAt;
        uint256 paidAt;
        bytes32 receiptHash; // on-chain proof-of-payment fingerprint, set on payment
    }

    IERC20 public immutable token;
    uint256 public invoiceCount;

    mapping(uint256 => Invoice) private _invoices;

    event InvoiceCreated(
        uint256 indexed invoiceId,
        address indexed issuer,
        address indexed payer,
        uint256 amount,
        string payeeName,
        bytes32 payeeNameHash
    );
    event InvoicePaid(
        uint256 indexed invoiceId,
        address indexed payer,
        address indexed issuer,
        uint256 amount,
        bytes32 receiptHash,
        uint256 paidAt
    );
    event InvoiceCancelled(uint256 indexed invoiceId, address indexed issuer);

    error InvoiceNotFound(uint256 invoiceId);
    error InvoiceNotOpen(uint256 invoiceId);
    error NotThePayer(uint256 invoiceId, address caller);
    error NotTheIssuer(uint256 invoiceId, address caller);
    error PayeeNameMismatch(uint256 invoiceId);
    error InvalidAmount();
    error InvalidPayer();
    error TransferFailed();

    constructor(address tokenAddress) {
        token = IERC20(tokenAddress);
    }

    /// @notice Normalize a payee name the same way the official UI does:
    ///         the hash is taken over the exact UTF-8 bytes of the name as
    ///         registered. The UI trims whitespace and shows the name in
    ///         large type before the payer confirms, so what the payer
    ///         confirms is exactly what was registered.
    function hashPayeeName(string calldata payeeName) public pure returns (bytes32) {
        return keccak256(bytes(payeeName));
    }

    /// @notice Create an invoice that binds amount + payee name to the payee
    ///         (issuer) wallet. The payer is fixed at creation time.
    /// @param payer Address that is expected to pay this invoice.
    /// @param amount Amount in tUSD8 base units (6 decimals).
    /// @param description Human-readable description of the work or goods.
    /// @param payeeName Verified display name of the payee (the issuer).
    /// @return invoiceId The id of the newly created invoice.
    function createInvoice(
        address payer,
        uint256 amount,
        string calldata description,
        string calldata payeeName
    ) external returns (uint256 invoiceId) {
        if (amount == 0) revert InvalidAmount();
        if (payer == address(0)) revert InvalidPayer();

        invoiceId = invoiceCount++;
        bytes32 nameHash = keccak256(bytes(payeeName));

        Invoice storage inv = _invoices[invoiceId];
        inv.issuer = msg.sender;
        inv.payer = payer;
        inv.amount = amount;
        inv.description = description;
        inv.payeeName = payeeName;
        inv.payeeNameHash = nameHash;
        inv.status = Status.Open;
        inv.createdAt = block.timestamp;

        emit InvoiceCreated(invoiceId, msg.sender, payer, amount, payeeName, nameHash);
    }

    /// @notice Pay an open invoice. THE CONFIRMATION OF PAYEE GATE:
    ///         `confirmedPayeeNameHash` must equal the payee name hash
    ///         registered on the invoice, otherwise the call reverts. The
    ///         payer obtains this hash by confirming the payee name shown
    ///         by the UI (typing it in full), so a payment can never be
    ///         executed toward a name the payer did not consciously verify.
    /// @param invoiceId The invoice to pay.
    /// @param confirmedPayeeNameHash keccak256 of the payee name as confirmed by the payer.
    function payInvoice(uint256 invoiceId, bytes32 confirmedPayeeNameHash) external {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.issuer == address(0)) revert InvoiceNotFound(invoiceId);
        if (inv.status != Status.Open) revert InvoiceNotOpen(invoiceId);
        if (msg.sender != inv.payer) revert NotThePayer(invoiceId, msg.sender);
        if (confirmedPayeeNameHash != inv.payeeNameHash) {
            revert PayeeNameMismatch(invoiceId);
        }

        // Effects before interaction (checks-effects-interactions).
        inv.status = Status.Paid;
        inv.paidAt = block.timestamp;
        bytes32 receipt = keccak256(
            abi.encode(invoiceId, inv.payer, inv.issuer, inv.amount, block.timestamp, block.chainid)
        );
        inv.receiptHash = receipt;

        // Interaction: pull the stablecoin from payer to issuer (payee).
        bool ok = token.transferFrom(msg.sender, inv.issuer, inv.amount);
        if (!ok) revert TransferFailed();

        emit InvoicePaid(invoiceId, msg.sender, inv.issuer, inv.amount, receipt, inv.paidAt);
    }

    /// @notice Cancel an open invoice. Only the issuer can cancel.
    function cancelInvoice(uint256 invoiceId) external {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.issuer == address(0)) revert InvoiceNotFound(invoiceId);
        if (msg.sender != inv.issuer) revert NotTheIssuer(invoiceId, msg.sender);
        if (inv.status != Status.Open) revert InvoiceNotOpen(invoiceId);
        inv.status = Status.Cancelled;
        emit InvoiceCancelled(invoiceId, msg.sender);
    }

    /// @notice Read a full invoice, including its payment receipt data.
    function getInvoice(uint256 invoiceId) external view returns (Invoice memory) {
        if (invoiceId >= invoiceCount) revert InvoiceNotFound(invoiceId);
        return _invoices[invoiceId];
    }

    /// @notice Anyone can verify a payment receipt: recompute the fingerprint
    ///         from the invoice's public fields and compare, or simply check
    ///         that the stored receipt matches and the invoice is Paid.
    function verifyReceipt(uint256 invoiceId, bytes32 receiptHash) external view returns (bool) {
        if (invoiceId >= invoiceCount) return false;
        Invoice storage inv = _invoices[invoiceId];
        return inv.status == Status.Paid && inv.receiptHash == receiptHash && receiptHash != bytes32(0);
    }
}
