import { BaseProvider } from '@ethersproject/providers'
import { Wallet } from '@ethersproject/wallet'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import VatArtifact from '../artifacts/contracts/Vat.sol/Vat.json'
import JoinArtifact from '../artifacts/contracts/Join.sol/Join.json'
import FYTokenArtifact from '../artifacts/contracts/FYToken.sol/FYToken.json'
import ERC20MockArtifact from '../artifacts/contracts/mocks/ERC20Mock.sol/ERC20Mock.json'
import CDPProxyArtifact from '../artifacts/contracts/CDPProxy.sol/CDPProxy.json'

import { Vat } from '../typechain/Vat'
import { Join } from '../typechain/Join'
import { FYToken } from '../typechain/FYToken'
import { ERC20Mock } from '../typechain/ERC20Mock'
import { CDPProxy } from '../typechain/CDPProxy'

import { ethers, waffle } from 'hardhat'
// import { id } from '../src'
import { expect } from 'chai'
const { deployContract, loadFixture } = waffle

import { YieldEnvironment } from './shared/fixtures'

describe('CDPProxy', () => {
  let env: YieldEnvironment
  let ownerAcc: SignerWithAddress
  let otherAcc: SignerWithAddress
  let owner: string
  let other: string
  let vat: Vat
  let fyToken: FYToken
  let base: ERC20Mock
  let ilk: ERC20Mock
  let ilkJoin: Join
  let cdpProxy: CDPProxy
  let cdpProxyFromOther: CDPProxy

  const mockAssetId =  ethers.utils.hexlify(ethers.utils.randomBytes(6))
  const emptyAssetId = '0x000000000000'
  const mockVaultId =  ethers.utils.hexlify(ethers.utils.randomBytes(12))
  const mockAddress =  ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)))
  const emptyAddress =  ethers.utils.getAddress('0x0000000000000000000000000000000000000000')
  const MAX = ethers.constants.MaxUint256

  async function fixture() {
    return await YieldEnvironment.setup(ownerAcc, otherAcc, [baseId], [seriesId])
  }

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = await ownerAcc.getAddress()

    otherAcc = signers[1]
    other = await otherAcc.getAddress()
  })

  const baseId = ethers.utils.hexlify(ethers.utils.randomBytes(6));
  const ilkId = ethers.utils.hexlify(ethers.utils.randomBytes(6));
  const seriesId = ethers.utils.hexlify(ethers.utils.randomBytes(6));
  const maturity = 1640995199;
  let vaultId: string

  beforeEach(async () => {
    env = await loadFixture(fixture);
    vat = env.vat
    cdpProxy = env.cdpProxy
    base = env.assets.get(baseId) as ERC20Mock
    // ilk = env.assets.get(ilkId) as ERC20Mock
    // ilkJoin = env.joins.get(ilkId) as Join
    // base = (await deployContract(ownerAcc, ERC20MockArtifact, [baseId, "Mock Base"])) as ERC20Mock
    // fyToken = (await deployContract(ownerAcc, FYTokenArtifact, [base.address, mockAddress, maturity, seriesId, "Mock FYToken"])) as FYToken
    fyToken = env.series.get(seriesId) as FYToken

    cdpProxyFromOther = cdpProxy.connect(otherAcc)

    // ==== Set testing environment ====
    // We add this asset manually, because `fixtures` would also add the join, which we want to test.
    ilk = (await deployContract(ownerAcc, ERC20MockArtifact, [ilkId, "Mock Ilk"])) as ERC20Mock

    await vat.addAsset(ilkId, ilk.address)
    await vat.setMaxDebt(baseId, ilkId, 2)
    await vat.addIlk(seriesId, ilkId)

    await vat.build(seriesId, ilkId)
    const event = (await vat.queryFilter(vat.filters.VaultBuilt(null, null, null, null)))[0]
    vaultId = event.args.vaultId

    // Finally, we deploy the join. A check that a join exists would be impossible in `vat` functions.
    ilkJoin = (await deployContract(ownerAcc, JoinArtifact, [ilk.address])) as Join

    await ilk.mint(owner, 10);
    await ilk.approve(ilkJoin.address, MAX);
  })

  it('does not allow adding a join before adding its ilk', async () => {
    await expect(cdpProxy.addJoin(mockAssetId, ilkJoin.address)).to.be.revertedWith('Asset not found')
  })

  it('adds a join', async () => {
    expect(await cdpProxy.addJoin(ilkId, ilkJoin.address)).to.emit(cdpProxy, 'JoinAdded').withArgs(ilkId, ilkJoin.address)
    expect(await cdpProxy.joins(ilkId)).to.equal(ilkJoin.address)
  })

  describe('with a join added', async () => {
    beforeEach(async () => {
      await cdpProxy.addJoin(ilkId, ilkJoin.address)
    })

    it('only one join per asset', async () => {
      await expect(cdpProxy.addJoin(ilkId, ilkJoin.address)).to.be.revertedWith('One Join per Asset')
    })

    it('only the vault owner can manage its collateral', async () => {
      await expect(cdpProxyFromOther.frob(vaultId, 1, 0)).to.be.revertedWith('Only vault owner')
    })

    it('users can frob to post collateral', async () => {
      expect(await cdpProxy.frob(vaultId, 1, 0)).to.emit(vat, 'VaultFrobbed').withArgs(vaultId, seriesId, ilkId, 1, 0)
      expect(await ilk.balanceOf(ilkJoin.address)).to.equal(1)
      expect((await vat.vaultBalances(vaultId)).ink).to.equal(1)
    })

    describe('with posted collateral', async () => {
      beforeEach(async () => {
        await cdpProxy.frob(vaultId, 1, 0)
      })
  
      it('users can frob to withdraw collateral', async () => {
        await expect(cdpProxy.frob(vaultId, -1, 0)).to.emit(vat, 'VaultFrobbed').withArgs(vaultId, seriesId, ilkId, -1, 0)
        expect(await ilk.balanceOf(ilkJoin.address)).to.equal(0)
        expect((await vat.vaultBalances(vaultId)).ink).to.equal(0)
      })

      it('users can frob to borrow fyToken', async () => {
        await expect(cdpProxy.frob(vaultId, 0, 1)).to.emit(vat, 'VaultFrobbed').withArgs(vaultId, seriesId, ilkId, 0, 1)
        expect(await fyToken.balanceOf(owner)).to.equal(1)
        expect((await vat.vaultBalances(vaultId)).art).to.equal(1)
      })
    })

    it('users can frob to post collateral and borrow fyToken', async () => {
      await expect(cdpProxy.frob(vaultId, 1, 1)).to.emit(vat, 'VaultFrobbed').withArgs(vaultId, seriesId, ilkId, 1, 1)
      expect(await ilk.balanceOf(ilkJoin.address)).to.equal(1)
      expect(await fyToken.balanceOf(owner)).to.equal(1)
      expect((await vat.vaultBalances(vaultId)).ink).to.equal(1)
      expect((await vat.vaultBalances(vaultId)).art).to.equal(1)
    })

    describe('with collateral and debt', async () => {
      beforeEach(async () => {
        await cdpProxy.frob(vaultId, 1, 1)
      })
  
      it('users can borrow while under the global debt limit', async () => {
        await expect(cdpProxy.frob(vaultId, 1, 1)).to.emit(vat, 'VaultFrobbed').withArgs(vaultId, seriesId, ilkId, 1, 1)
      })

      it('users can\'t borrow over the global debt limit', async () => {
        await expect(cdpProxy.frob(vaultId, 2, 2)).to.be.revertedWith('Vat: Max debt exceeded')
      })
    })
  })
})