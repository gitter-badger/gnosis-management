import Gnosis from '@gnosis.pm/gnosisjs'

import { normalizeHex, hexWithPrefix } from 'utils/helpers'
import { OUTCOME_TYPES, ORACLE_TYPES } from 'utils/constants'

import delay from 'await-delay'
import Decimal from 'decimal.js'

const GNOSIS_OPTIONS = {}

let gnosisInstance
const getGnosisConnection = async () => {
  if (gnosisInstance) {
    return Promise.resolve(gnosisInstance)
  }

  try {
    gnosisInstance = await Gnosis.create(GNOSIS_OPTIONS)
    window.gnosis = gnosisInstance
    console.info('Gnosis Integration: connection established') // eslint-disable-line no-console
  } catch (err) {
    console.error('Gnosis Integration: connection failed') // eslint-disable-line no-console
    console.error(err) // eslint-disable-line no-console
  }

  return gnosisInstance
}

const getCurrentAccount = async () => {
  const gnosis = await getGnosisConnection()

  return gnosis.web3.eth.accounts[0]
}


export const createEventDescription = async (eventDescription) => {
  console.log('eventDescription', eventDescription)
  const gnosis = await getGnosisConnection()
  // console.log(description)

  const ipfsHash = await gnosis.publishEventDescription(eventDescription)

  await delay(5000)
  
  return {
    ipfsHash,
    ...eventDescription,
  }
}

export const createOracle = async (oracle) => {
  console.log('oracle', oracle)
  const gnosis = await getGnosisConnection()
  let oracleContract

  if (oracle.type === ORACLE_TYPES.CENTRALIZED) {
    oracleContract = await gnosis.createCentralizedOracle(oracle.eventDescription)
  } else if (oracle.type === ORACLE_TYPES.ULTIMATE) {
    // TODO: add remaining parameters and document
    oracleContract = await gnosis.createUltimateOracle(oracle)
  } else {
    throw new Error('invalid oracle type')
  }

  await delay(5000)

  return {
    oracle: oracleContract.address,
    ...oracle,
  }
}

export const createEvent = async (event) => {
  console.log('event', event)
  const gnosis = await getGnosisConnection()

  // hardcoded for current version
  // event.collateralToken = gnosis.etherToken

  let eventContract

  if (event.type === OUTCOME_TYPES.CATEGORICAL) {
    eventContract = await gnosis.createCategoricalEvent({
      ...event,
      collateralToken: gnosis.etherToken.address,
    })
  } else if (event.type === OUTCOME_TYPES.SCALAR) {
    console.log(event)
    const scalarEvent = {
      ...event,
      collateralToken: gnosis.etherToken.address,
      lowerBound: Decimal(event.lowerBound).times(10 ** event.decimals).toString(),
      upperBound: Decimal(event.upperBound).times(10 ** event.decimals).toString(),
    }
    console.log(scalarEvent)
    eventContract = await gnosis.createScalarEvent(scalarEvent)
  } else {
    throw new Error('invalid outcome/event type')
  }

  await delay(5000)

  return {
    event: eventContract.address,
    ...event,
  }
}

export const createMarket = async (market) => {
  console.log('market', market)
  const gnosis = await getGnosisConnection()
  market.funding = Decimal(market.funding).div(1e18).toString()

  const marketContract = await gnosis.createMarket({
    ...market,
    marketMaker: gnosis.lmsrMarketMaker,
    marketFactory: gnosis.standardMarketFactory,
  })

  await delay(5000)

  return {
    ...market,
    market: marketContract.address,
  }
}

export const fundMarket = async (market) => {
  console.log('funding', market)
  const gnosis = await getGnosisConnection()

  const marketContract = gnosis.contracts.Market.at(market.market)
  const marketFunding = Decimal(market.funding).div(1e18)//.mul(1+1e-9)
  console.log(marketFunding.toFixed(5))

  await gnosis.etherToken.deposit({ value: marketFunding.toString() })
  await gnosis.etherToken.approve(marketContract.address, marketFunding.toString())

  const balance = await gnosis.etherToken.balanceOf(gnosis.web3.eth.accounts[0])
  console.log(`Ethertoken balance: ${balance.div(1e18).toFixed(4)}`)

  if (balance.lt(marketFunding)) {
  //  throw new Error(`Not enough funds: required ${marketFunding.toFixed(5)} of ${balance.div(1e18).toFixed(5)}`)
  }

  await marketContract.fund(marketFunding.toString())

  await delay(5000)

  return market
}

/**
 * Creates all necessary contracts to create a whole market.
 *
 * @param {string} opts.title
 * @param {string} opts.description
 * @param {string[]} opts.outcomes
 * @param {string} opts.resolutionDate - ISO String Date
 * @param {(string|Contract)} opts.collateralToken
 * @param {(string|Contract)} opts.oracle
 * @param {(string|Contract)} opts.marketFactory
 * @param {(string|Contract)} opts.marketMaker
 * @param {(number|BigNumber)} opts.funding
 * @param {(number|BigNumber)} opts.fee
 */

export const buyShares = async (market, selectedOutcomeIndex, collateralTokenAmount) => {
  const gnosis = await getGnosisConnection()

  const collateralTokenWei = new Decimal(collateralTokenAmount).mul(1e18).toString()
  // console.log(collateralTokenWei)

  const marketContract = await gnosis.contracts.Market.at(hexWithPrefix(market.address))
  const outcomeIndex = parseInt(selectedOutcomeIndex, 10)

  const outcomeTokenAmount = Gnosis.calcLMSROutcomeTokenCount({
    netOutcomeTokensSold: market.netOutcomeTokensSold,
    cost: collateralTokenWei,
    funding: market.funding,
    outcomeTokenIndex: outcomeIndex,
  })

  const outcomeTokenAmountFix = outcomeTokenAmount.mul(0.99).floor()

  // console.log(outcomeTokenAmount.div(1e18).toString())
  // console.log("deposit")
  await gnosis.etherToken.deposit({ value: collateralTokenWei })
  // console.log("approve")
  await gnosis.etherToken.approve(hexWithPrefix(market.address), collateralTokenWei)

  // console.log("buy shares")
  return await marketContract.buy(outcomeIndex, outcomeTokenAmountFix.toString(), collateralTokenWei.toString())
}

export const calcLMSRCost = Gnosis.calcLMSRCost
export const calcLMSROutcomeTokenCount = Gnosis.calcLMSROutcomeTokenCount
export const calcLMSRMarginalPrice = Gnosis.calcLMSRMarginalPrice