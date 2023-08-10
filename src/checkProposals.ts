import { PublicKey } from '@solana/web3.js'
import {
  getGovernanceAccounts,
  Governance,
  ProgramAccount,
  Proposal,
  ProposalState,
  pubkeyFilter,
} from '@solana/spl-governance'
import { Command } from 'commander'
import { parsePubkey } from '@marinade.finance/cli-common'
import { MNDE_REALM_ADDRESS } from '@marinade.finance/spl-gov-utils'
import { useContext } from './context'
import { accountsToPubkeyMap } from './utils'
import { notify } from './notifier'
import { Logger } from 'pino'

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
        realm: Promise<PublicKey>
        timePeriod: number
      }) => {
        await checkProposals({
          realm: await realm,
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

  const realmAccount = await connection.getAccountInfo(realm)
  if (realmAccount === null) {
    throw new Error(
      `Realm ${realm.toBase58()} not found via RPC '${connection.rpcEndpoint}'`
    )
  }
  const governances = await getGovernanceAccounts(
    connection,
    realmAccount.owner,
    Governance,
    [pubkeyFilter(1, realm)!]
  )

  const governancesMap = accountsToPubkeyMap(governances)

  logger.info(
    `getting all proposals for all #${governances.length} governances`
  )
  const proposalsByGovernance = await Promise.all(
    Object.keys(governancesMap).map(governancePk => {
      return getGovernanceAccounts(connection, realmAccount.owner, Proposal, [
        pubkeyFilter(1, new PublicKey(governancePk))!,
      ])
    })
  )
  const proposals = proposalsByGovernance.flat()

  const realmUriComponent = encodeURIComponent(realm.toBase58())
  logger.info(
    `scanning all proposals from realm ${realm.toBase58()} #` + proposals.length
  )
  let countJustOpenedForVoting = 0
  let countOpenForVotingSinceSomeTime = 0
  let countVotingNotStartedYet = 0
  let countClosed = 0
  let countCancelled = 0
  const nowInSeconds = new Date().getTime() / 1000
  for (const proposal of proposals) {
    debugProposal(logger, proposal)
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

      const msg = `SPL Governance proposal '${
        proposal.account.name
      }' just opened for voting: https://realms.today/dao/${realmUriComponent}/proposal/${proposal.pubkey.toBase58()}`

      await notify(msg)
    }
    // note that these could also include those in finalizing state, but this is just for logging
    else if (proposal.account.state === ProposalState.Voting) {
      countOpenForVotingSinceSomeTime++
    }

    const remainingInSeconds =
      governancesMap[proposal.account.governance.toBase58()].account.config
        .baseVotingTime +
      proposal.account.votingAt.toNumber() -
      nowInSeconds
    if (
      remainingInSeconds > 86400 &&
      remainingInSeconds < 86400 + timePeriod + toleranceInSeconds
    ) {
      const msg = `SPL Governance proposal '${
        proposal.account.name
      }' will close for voting: https://realms.today/dao/${realmUriComponent}/proposal/${proposal.pubkey.toBase58()} in 24 hrs`

      await notify(msg)
    }
  }
  logger.info(
    `countOpenForVotingSinceSomeTime: ${countOpenForVotingSinceSomeTime}, ` +
      `countJustOpenedForVoting: ${countJustOpenedForVoting}, countVotingNotStartedYet: ${countVotingNotStartedYet}, ` +
      `countClosed: ${countClosed}, countCancelled: ${countCancelled}`
  )
}

function getStateKey(value: number): string | undefined {
  return Object.keys(ProposalState).find(key => ProposalState[value] === key)
}

function debugProposal(logger: Logger, proposal: ProgramAccount<Proposal>) {
  logger.debug(
    'proposal: %s, name: %s, state: %s, completedAt: %s, votingAt: %s',
    proposal.pubkey.toBase58(),
    proposal.account.name,
    getStateKey(proposal.account.state),
    proposal.account.votingCompletedAt
      ? new Date(proposal.account.votingCompletedAt.toNumber() * 1000)
      : null,
    proposal.account.votingAt
      ? new Date(proposal.account.votingAt.toNumber() * 1000)
      : null
  )
}
