// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * FableItems — ERC-1155 semi-fungible game item NFTs for Fable RPG.
 *
 * Deploy to Celo Alfajores (testnet) first, then Celo mainnet.
 * After deploying, set:
 *   NEXT_PUBLIC_FABLE_ITEMS_ADDRESS = <deployed address>
 *   MINTER_PRIVATE_KEY = <server minter wallet private key>
 *
 * Token IDs:
 *   1  = Iron Sword
 *   2  = Ember Blade
 *   3  = Obsidian Greatsword
 *   4  = Fire Nova (ability)
 *   5  = Poison Cloak (ability)
 *   6  = Stone Shield (ability)
 *
 * Deployment (via Remix or Hardhat):
 *   constructor args:
 *     admin   = deployer wallet (multisig recommended for prod)
 *     minter  = server-side minter wallet address
 *     baseURI = "https://<your-domain>/api/nft-metadata/"
 *               OR an IPFS gateway prefix pointing to item JSON files
 */

// Inline minimal OpenZeppelin interfaces to avoid needing a full package install
// for Remix deployment. For Hardhat use: @openzeppelin/contracts@^5

interface IERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4);
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4);
}

contract FableItems {
    // ── ERC-1155 storage ──────────────────────────────────────────────────────
    mapping(uint256 => mapping(address => uint256)) private _balances;
    mapping(address => mapping(address => bool))    private _operatorApprovals;
    string private _uri;

    // ── Access control ────────────────────────────────────────────────────────
    address public admin;
    address public minter;

    // ── Events ────────────────────────────────────────────────────────────────
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event ItemMinted(address indexed to, uint256 indexed tokenId, string itemSlug);
    event MinterChanged(address indexed oldMinter, address indexed newMinter);

    modifier onlyAdmin()  { require(msg.sender == admin,  "FableItems: not admin");  _; }
    modifier onlyMinter() { require(msg.sender == minter, "FableItems: not minter"); _; }

    constructor(address _admin, address _minter, string memory baseURI) {
        admin  = _admin;
        minter = _minter;
        _uri   = baseURI;
    }

    // ── Core mint (called by server minter after verifying G$ payment) ────────
    function mint(address to, uint256 tokenId, string calldata itemSlug) external onlyMinter {
        require(to != address(0), "FableItems: mint to zero address");
        require(tokenId >= 1 && tokenId <= 6, "FableItems: unknown tokenId");

        _balances[tokenId][to] += 1;
        emit TransferSingle(msg.sender, address(0), to, tokenId, 1);
        emit ItemMinted(to, tokenId, itemSlug);

        // ERC-1155 receiver check for contracts
        uint256 size;
        assembly { size := extcodesize(to) }
        if (size > 0) {
            bytes4 retval = IERC1155Receiver(to).onERC1155Received(
                msg.sender, address(0), tokenId, 1, ""
            );
            require(retval == IERC1155Receiver.onERC1155Received.selector, "FableItems: ERC1155Receiver rejected");
        }
    }

    // ── ERC-1155 read functions ───────────────────────────────────────────────
    function balanceOf(address account, uint256 id) public view returns (uint256) {
        require(account != address(0), "FableItems: zero address");
        return _balances[id][account];
    }

    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids)
        public view returns (uint256[] memory)
    {
        require(accounts.length == ids.length, "FableItems: length mismatch");
        uint256[] memory batchBalances = new uint256[](accounts.length);
        for (uint256 i = 0; i < accounts.length; ++i) {
            batchBalances[i] = _balances[ids[i]][accounts[i]];
        }
        return batchBalances;
    }

    function uri(uint256 tokenId) public view returns (string memory) {
        return string(abi.encodePacked(_uri, _toString(tokenId), ".json"));
    }

    function isApprovedForAll(address account, address operator) public view returns (bool) {
        return _operatorApprovals[account][operator];
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return
            interfaceId == 0xd9b67a26 || // ERC-1155
            interfaceId == 0x0e89341c || // ERC-1155 Metadata
            interfaceId == 0x01ffc9a7;   // ERC-165
    }

    // ── ERC-1155 write functions ──────────────────────────────────────────────
    function setApprovalForAll(address operator, bool approved) external {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external {
        require(from == msg.sender || _operatorApprovals[from][msg.sender], "FableItems: not authorized");
        require(to != address(0), "FableItems: transfer to zero");
        require(_balances[id][from] >= amount, "FableItems: insufficient balance");
        _balances[id][from] -= amount;
        _balances[id][to]   += amount;
        emit TransferSingle(msg.sender, from, to, id, amount);
    }

    // ── Admin functions ───────────────────────────────────────────────────────
    function setBaseURI(string calldata newURI) external onlyAdmin {
        _uri = newURI;
    }

    function setMinter(address newMinter) external onlyAdmin {
        emit MinterChanged(minter, newMinter);
        minter = newMinter;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        admin = newAdmin;
    }

    // ── Utility ───────────────────────────────────────────────────────────────
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
