import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import { getConnectionContext } from 'utils/connection'
import {
  getGovernanceAccounts,
  Governance,
  Proposal,
  ProposalState,
  pubkeyFilter,
} from '@solana/spl-governance'
import { getCertifiedRealmInfo } from '@models/registry/api'
import { accountsToPubkeyMap } from '@tools/sdk/accounts'
import { Command } from 'commander'

// advanced from https://github.com/solana-labs/governance-ui
// expecting to be run every 5 mins via a cronjob, checks if a governance proposal just opened in the last 5 mins
// and notifies on WEBHOOK_URL

const fiveMinutesSeconds = 5 * 60
const toleranceSeconds = 30

export function installCheckProposals(program: Command) {
  program
    .command('add-liquidity')
    .description('Provide liquidity to the liquidity pool')
    .argument('<amount-sol>', 'SOL amount to add to liquidity pool', parseFloat)
    .action(async (amountSol: number) => {
      await checkProposals({
        amountSol,
      })
    })
}

// run every 5 mins, checks if a governance proposal just opened in the last 5 mins
// and notifies on WEBHOOK_URL
export async function checkProposals({}): Promise<void> {
  const REALM = process.env.REALM || 'MNGO'
  const connectionContext = getConnectionContext('mainnet')
  const realmInfo = await getCertifiedRealmInfo(REALM, connectionContext)

  const connection = new Connection(process.env.CLUSTER_URL!)
  console.log(`- getting all governance accounts for ${REALM}`)
  const governances = await getGovernanceAccounts(
    connection,
    realmInfo!.programId,
    Governance,
    [pubkeyFilter(1, realmInfo!.realmId)!]
  )

  const governancesMap = accountsToPubkeyMap(governances)

  console.log(`- getting all proposals for all governances`)
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap).map((governancePk) => {
      return getGovernanceAccounts(connection, realmInfo!.programId, Proposal, [
        pubkeyFilter(1, new PublicKey(governancePk))!,
      ])
    })
  )

  console.log(`- scanning all '${REALM}' proposals`)
  let countJustOpenedForVoting = 0
  let countOpenForVotingSinceSomeTime = 0
  let countVotingNotStartedYet = 0
  let countClosed = 0
  let countCancelled = 0
  const nowInSeconds = new Date().getTime() / 1000
  for (const proposals_ of proposalsByGovernance) {
    for (const proposal of proposals_) {
      //// debugging
      // console.log(
      //   `-- proposal ${proposal.account.governance.toBase58()} - ${
      //     proposal.account.name
      //   }`
      // )

      if (
        // proposal is cancelled
        proposal.account.state === ProposalState.Cancelled
      ) {
        countCancelled++
        continue
      }

      if (
        // voting is closed
        proposal.account.votingCompletedAt
      ) {
        countClosed++
        continue
      }

      if (
        // voting has not started yet
        !proposal.account.votingAt
      ) {
        countVotingNotStartedYet++
        continue
      }

      if (
        // proposal opened in last 5 mins
        nowInSeconds - proposal.account.votingAt.toNumber() <=
        fiveMinutesSeconds + toleranceSeconds
        // proposal opened in last 24 hrs - useful to notify when bot recently stopped working
        // and missed the 5 min window
        // (nowInSeconds - proposal.info.votingAt.toNumber())/(60 * 60) <=
        // 24
      ) {
        countJustOpenedForVoting++

        const msg = `“${
          proposal.account.name
        }” proposal just opened for voting 🗳 https://realms.today/dao/${escape(
          REALM
        )}/proposal/${proposal.pubkey.toBase58()}`

        console.log(msg)
        if (process.env.WEBHOOK_URL) {
          axios.post(process.env.WEBHOOK_URL, { content: msg })
        }
      }
      // note that these could also include those in finalizing state, but this is just for logging
      else if (proposal.account.state === ProposalState.Voting) {
        countOpenForVotingSinceSomeTime++

        //// in case bot has an issue, uncomment, and run from local with webhook url set as env var
        // const msg = `“${
        //     proposal.account.name
        // }” proposal just opened for voting 🗳 https://realms.today/dao/${escape(
        //     REALM
        // )}/proposal/${proposal.pubkey.toBase58()}`
        //
        // console.log(msg)
        // if (process.env.WEBHOOK_URL) {
        //   axios.post(process.env.WEBHOOK_URL, { content: msg })
        // }
      }

      const remainingInSeconds =
        governancesMap[proposal.account.governance.toBase58()].account.config
          .baseVotingTime +
        proposal.account.votingAt.toNumber() -
        nowInSeconds
      if (
        remainingInSeconds > 86400 &&
        remainingInSeconds < 86400 + fiveMinutesSeconds + toleranceSeconds
      ) {
        const msg = `“${
          proposal.account.name
        }” proposal will close for voting 🗳 https://realms.today/dao/${escape(
          REALM
        )}/proposal/${proposal.pubkey.toBase58()} in 24 hrs`

        console.log(msg)
        if (process.env.WEBHOOK_URL) {
          axios.post(process.env.WEBHOOK_URL, { content: msg })
        }
      }
    }
  }
  console.log(
    `-- countOpenForVotingSinceSomeTime: ${countOpenForVotingSinceSomeTime}, countJustOpenedForVoting: ${countJustOpenedForVoting}, countVotingNotStartedYet: ${countVotingNotStartedYet}, countClosed: ${countClosed}, countCancelled: ${countCancelled}`
  )
}

export interface ConnectionContext {
  cluster: EndpointTypes
  current: Connection
  endpoint: string
}

export function getConnectionContext(cluster: string): ConnectionContext {
  const ENDPOINT = ENDPOINTS.find((e) => e.name === cluster) || ENDPOINTS[0]
  return {
    cluster: ENDPOINT!.name as EndpointTypes,
    current: new Connection(ENDPOINT!.url, 'recent'),
    endpoint: ENDPOINT!.url,
  }
}

// start notifier immediately
errorWrapper()

setInterval(errorWrapper, fiveMinutesSeconds * 1000)