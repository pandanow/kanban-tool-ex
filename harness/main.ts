// Dev harness entry.
//
// Installs the same fake KT globals the integration tests use, then loads the real
// extension on top. It reuses test/integration/fakeKT.ts deliberately: a second,
// harness-only fake would drift from the one the tests pin behaviour against.
//
// This is a development aid for seeing and clicking the table without a Kanban Tool
// account. It is never part of the shipped bundle.

import { board, task } from '../test/fixtures/board'
import { installFakeCards, installFakeKT, setupBoardPage } from '../test/integration/fakeKT'
import type { TaskAttributes } from '../src/kt/types'

const CARD_COUNT = Number(new URLSearchParams(location.search).get('cards') ?? 400)

const STAGES = [1, 3, 4, 5]
const USERS = [30, 31, null]
const TEAMS = ['Platform', 'Growth', 'Data', null]
const CUSTOMERS = ['Acme', 'Globex', 'Initech', 'Umbrella', null]

function sample<T>(values: T[], index: number): T {
  return values[index % values.length] as T
}

function makeTasks(count: number): TaskAttributes[] {
  return Array.from({ length: count }, (_, i) =>
    task({
      id: i + 1,
      position: i,
      name: `${sample(['Fix', 'Ship', 'Investigate', 'Refactor', 'Document'], i)} ${sample(
        ['login', 'billing', 'search', 'onboarding', 'exports'],
        i * 3,
      )} (#${i + 1})`,
      workflow_stage_id: sample(STAGES, i),
      swimlane_id: sample([10, 11], i),
      card_type_id: sample([20, 21], i),
      assigned_user_id: sample(USERS, i),
      priority: sample([-1, 0, 1], i),
      due_date: i % 4 === 0 ? null : `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      time_estimate: i % 5 === 0 ? null : (i % 8) * 1800,
      timers_total: (i % 6) * 1200,
      tags: sample(['api,urgent', 'ui', '', 'infra,api'], i),
      subtasks_count: i % 5,
      subtasks_completed_count: i % 3,
      comments_count: i % 4,
      custom_field_1: sample(CUSTOMERS, i),
      custom_field_3: i % 13,
      custom_field_4: sample(TEAMS, i),
      custom_field_6: i % 3 === 0 ? '2026-11-02' : null,
      custom_field_7: sample(USERS, i * 2),
    }),
  )
}

setupBoardPage()
const tasks = makeTasks(CARD_COUNT)
installFakeKT(board, tasks)
// Stand-in cards and task view, so "Open card" can be exercised here: it should layer
// the card over the table and leave the table up behind it.
installFakeCards(tasks.map((t) => t.id))

// Loaded last, and dynamically, so the extension finds KT already on the page - the
// same order a real board page gives it.
void import('../src/index')
