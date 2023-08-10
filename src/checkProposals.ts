import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import {
  getGovernanceAccounts,
  Governance,
  Proposal,
  ProposalState,
  pubkeyFilter,
} from '@solana/spl-governance'
import { Command } from 'commander'
import { parsePubkey } from '@marinade.finance/cli-common'
import { MNDE_REALM_ADDRESS } from '@marinade.finance/spl-gov-utils'
import { useContext } from './context'
import { accountsToPubkeyMap } from './utils'

// advanced from https://github.com/solana-labs/governance-ui
//  - expecting to be run every X mins via a cronjob
//  - checking if a governance proposal just opened in the last X mins
//  - notifies on WEBHOOK_URL if a new governance proposal was created

const fiveMinutesInSeconds = 5 * 60
const toleranceInSeconds = 30

export function installCheckProposals(program: Command) {
  program
    .command('proposals')
    .description('Verify existence of governance proposals in last time period')
    .option(
      '-r, --realm <realm>',
      'Realm to check proposals for',
      parsePubkey,
      Promise.resolve(MNDE_REALM_ADDRESS)
    )
    .option(
      '-t, --time-period <number-in-seconds>',
      'How many seconds in past should be checked, default 5 minutes' +
        'for new proposals in realm',
      parseFloat,
      fiveMinutesInSeconds
    )
    .action(
      async ({
        realm,
        timePeriod,
      }: {
        realm: PublicKey
        timePeriod: number
      }) => {
        await checkProposals({
          realm,
          timePeriod,
        })
      }
    )
}

export async function checkProposals({
  realm,
  timePeriod,
}: {
  realm: PublicKey
  timePeriod: number
}): Promise<void> {
  const { connection, logger } = useContext()
  logger.info(`getting all governance accounts for ${realm.toBase58()}`)

  const governances = await getGovernanceAccounts(
    connection,
    realm,
    Governance,
    [pubkeyFilter(1, realm)!]
  )

  const governancesMap = accountsToPubkeyMap(governances)

  logger.info(
    `getting all proposals for all #${governances.length} governances`
  )
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap).map(governancePk => {
      return getGovernanceAccounts(connection, realm, Proposal, [
        pubkeyFilter(1, new PublicKey(governancePk))!,
      ])
    })
  )

  console.log(`scanning all proposals from realm ${realm.toBase58()}`)
  let countJustOpenedForVoting = 0
  let countOpenForVotingSinceSomeTime = 0
  let countVotingNotStartedYet = 0
  let countClosed = 0
  let countCancelled = 0
  const nowInSeconds = new Date().getTime() / 1000
  for (const proposals_ of proposalsByGovernance) {
    for (const proposal of proposals_) {
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
        // proposal opened in last X mins
        nowInSeconds - proposal.account.votingAt.toNumber() <=
        timePeriod + toleranceInSeconds
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
        remainingInSeconds < 86400 + fiveMinutesInSeconds + toleranceInSeconds
      ) {
        const msg = `“${
          proposal.account.name
        }” proposal will close for voting 🗳 https://realms.today/dao/${encodeURIComponent(
          realm.toBase58()
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
  const ENDPOINT = ENDPOINTS.find(e => e.name === cluster) || ENDPOINTS[0]
  return {
    cluster: ENDPOINT!.name as EndpointTypes,
    current: new Connection(ENDPOINT!.url, 'recent'),
    endpoint: ENDPOINT!.url,
  }
}
