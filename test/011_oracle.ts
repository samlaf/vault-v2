import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address'
import OracleArtifact from '../artifacts/contracts/mocks/OracleMock.sol/OracleMock.json'

import { OracleMock as Oracle } from '../typechain/OracleMock'
import { BigNumber } from 'ethers'

import { ethers, waffle } from 'hardhat'
// import { id } from '../src'
import { expect } from 'chai'
const { deployContract } = waffle

describe('Oracle', () => {
  let ownerAcc: SignerWithAddress
  let owner: string
  let oracle: Oracle

  const pastMaturity = 1600000000
  const RAY = BigNumber.from("1000000000000000000000000000")

  before(async () => {
    const signers = await ethers.getSigners()
    ownerAcc = signers[0]
    owner = await ownerAcc.getAddress()
  })

  beforeEach(async () => {
    oracle = (await deployContract(ownerAcc, OracleArtifact, [])) as Oracle
  })

  it('sets and retrieves the spot price', async () => {
    await oracle.setSpot(1)
    expect(await oracle.spot()).to.equal(1)
  })

  it('records and retrieves the spot price', async () => {
    await oracle.setSpot(1)
    expect(await oracle.spot()).to.equal(1)
  })

  describe('with a spot price', async () => {
    beforeEach(async () => {
      await oracle.setSpot(1)
    })

    it('records and retrieves the spot price', async () => {
      expect(await oracle.record(pastMaturity)).to.emit(oracle, 'SpotRecorded').withArgs(pastMaturity, 1)

      await oracle.setSpot(2) // Just to be sure we are retrieving the recorded value
      expect(await oracle.recorded(pastMaturity)).to.equal(1)
    })

    describe('with a recorded price', async () => {
      beforeEach(async () => {
        await oracle.record(pastMaturity)
      })
  
      it('retrieves the spot price accrual', async () => {
        await oracle.setSpot(2) // Just to be sure we are retrieving the recorded value
        expect(await oracle.accrual(pastMaturity)).to.equal(RAY.mul(2))
      })
    })
  })
})