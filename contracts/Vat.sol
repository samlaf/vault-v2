// Token balances will be kept in the join, for flexibility in their management
contract TokenJoin {
    function join(address usr, uint wad)
    function exit(address usr, uint wad)

}

contract FYTokenJoin {
    function join(address usr, uint wad)
    function exit(address usr, uint wad)

}


contract Vat {
  
    // ---- Administration ----
    function addCollateral(bytes6 id, address collateral)
    function addUnderlying(address underlying)                       
    function addSeries(bytes32 series, IERC20 underlying, IFYToken fyToken)
    function addOracle(IERC20 underlying, IERC20 collateral, IOracle oracle)

    mapping (bytes6 => mapping(bytes6 => address))  oracles            // oracles[underlying][collateral] Return the address of the oracle and whether the oracle has an accrual value on top of the spot.
    mapping (address => mapping(bytes6 => uint128)) safe               // safe[user][collateral]          The `safe` of each user contains assets (including fyDai) that are not assigned to any vault, and therefore unencumbered.

    // ---- Vault composition----
    // An user can own one or more Vaults, each one with a bytes12 identifier so that we can pack a singly linked list and a reverse search in a bytes32
    mapping (address => bytes12)                    first              // Each user points to the list head. We have 20 bytes here that we can still use.
    mapping (bytes12 => bytes32)                    next               // With a vault identifier we can get both the owner and the next in the list. When giving a vault both are changed with 1 SSTORE.
 
    mapping (bytes12 => bytes32)                    series             // Each vault is related to only one series, which also determines the underlying. If there is any other data that is set up on initialization, we can pack it with the series.
    mapping (bytes12 => bytes32)                    collaterals        // Collaterals are identified by just 6 bytes, then in 32 bytes (one SSTORE) we can have an array of 5 collateral types to allow multi-collateral vaults. 
    mapping (bytes12 => mapping(bytes6 => uint128)) assets             // assets[vault][collateral]       The collateral held in a vault can be on a uint128 for each type. With packing we can use only one SSTORE to modify both the debt and the first collateral balance.
    mapping (bytes12 => uint128)                    debt

    // ---- Vault management ----
    // Create a new vault, linked to a series (and therefore underlying) and up to 6 collateral types
    // 2 SSTORE for series and up to 6 collateral types, plus 2 SSTORE for vault ownership.
    function build(bytes32 series, bytes32 collaterals)

    // Change a vault series and/or collateral types. 2 SSTORE.
    // We can change the series if there is no debt, or collaterals types if there is no collateral
    function tweak(bytes12 vault, bytes32 series, bytes32 collaterals)

    // Add collateral to vault. 2.5 or 3.5 SSTORE per collateral type, rounding up.
    // Remove collateral from vault. 2.5 or 3.5 SSTORE per collateral type, rounding up.
    function slip(bytes12 vault, bytes32 collaterals, int128[] memory inks) // Remember that bytes32 collaterals is an array of up to 6 collateral types.

    // Move collateral from one vault to another (like when rolling a series). 1 SSTORE for each 2 collateral types.
    function flux(bytes12 from, bytes12 to, bytes32 collaterals, uint128[] memory inks)

    // Move debt from one vault to another (like when rolling a series). 2 SSTORE.
    // Note, it won't be possible if the Vat doesn't know about pools
    function move(bytes12 from, bytes12 to, uint128 art)

    // Move collateral and debt. Combine costs of `flux` and `move`, minus 1 SSTORE.
    // Note, it won't be possible if the Vat doesn't know about pools
    function roll(bytes12 from, bytes12 to, bytes32 collaterals, uint128[] memory inks, uint128 art)

    // Transfer vault to another user. 2 or 3 SSTORE.
    function give(bytes12 vault, address user)

    // Borrow from vault and push borrowed asset to user 
    // Repay to vault and pull borrowed asset from user 
    function draw(bytes12 vault, int128 art). // 3 SSTORE.

    // Add collateral and borrow from vault, pull collaterals from and push borrowed asset to user
    // Repay to vault and remove collateral, pull borrowed asset from and push collaterals to user
    // Same cost as `slip` but with an extra cheap collateral. As low as 5 SSTORE for posting WETH and borrowing fyDai
    function frob(bytes12 vault, bytes32 collaterals,  int128[] memory inks, int128 art)
    
    // Repay vault debt using underlying token, pulled from user. Collaterals are pushed to user. 
    function close(bytes12 vault, bytes32 collaterals, uint128[] memory inks, uint128 art) // Same cost as `frob`

    // ---- Accounting ----

    // Return the vault debt in underlying terms
    function dues(bytes12 vault) view returns (uint128 uart) {
        IFYToken fyToken = series[vault];                                 // 1 LOOKUP + SLOAD
        if (fyToken.isMature()) {                                         // 1 CALL + SLOAD
            uint256 debt_ = debt[vault]                                   // 1 LOOKUP + SLOAD
            for each collateral {                                         // * C
                IOracle oracle = oracles[underlying][collateral];         // 2 LOOKUP + SLOAD
                uart += debt_ * oracle.accrual(fyToken.maturity());       // 2 CALL + 3 SLOAD | The accrual would be positive for `rate` equivalents, negative for `chi` equivalents.
            }
        } else {
            uart = debt[vault];                                           // 1 LOOKUP + SLOAD
        }
    }

    // Return the capacity of the vault to borrow underlying based on the collaterals held
    function value(bytes12 vault) view returns (uint128 uart) {
        for each collateral {                                             // * C
            IOracle oracle = oracles[underlying][collateral];             // 2 LOOKUP + SLOAD
            uart += assets[vault][collateral] * oracle.spot();            // 2 LOOKUP + SLOAD + CALL + SLOAD | Divided by collateralization ratio
        }
    }

    // Return the collateralization level of a vault. It will be negative if undercollateralized.
    // This can be optimized so that oracle.accrual and oracle.spot are retrieved in a single call.
    function level(bytes12 vault) view returns (int128 uart) {
        return value(vault) - dues(vault);                                // 1 CALL + 2 LOOKUP + 3 SLOAD + C * (2 CALL + 2 LOOKUP + 4 SLOAD) (maybe optimize to almost half that)
    }

    // ---- Liquidations ----
    // Each liquidation engine can:
    // - Mark vaults as not a target for liquidation
    // - Donate assets to the Vat
    // - Cancel debt in liquidation vaults at no cost
    // - Retrieve collateral from liquidation vaults
    // - Give vaults to non-privileged users
    // Giving a user vault to a liquidation engine means it will be auctioned and liquidated.
    // The vault will be returned to the user once it's healthy.
}