import { defineFixture } from '../../../component-fixtures/component-fixture'
import { AeroBoardCards } from './AeroBoardCards'

export const projectBoard = defineFixture({
  width: 340,
  render: () => (
    <AeroBoardCards
      board={{
        stem: 'migration',
        name: 'Migration',
        columns: [
          { id: 'doing', title: 'Doing' },
          { id: 'done', title: 'Done' }
        ],
        cards: [
          {
            id: 'board-panel',
            title: 'Read Aero boards in Orca',
            desc: 'Keep existing project boards visible while migrating daily work.',
            column: 'doing',
            priority: 'high',
            subtasks: [
              { title: 'Authorize project reads', done: true },
              { title: 'Verify live updates', done: false }
            ]
          },
          {
            id: 'knowledge',
            title: 'Connect the knowledge network',
            desc: 'Merged and available to agents.',
            column: 'done',
            priority: '',
            subtasks: []
          },
          {
            id: 'old-column',
            title: 'A card in a removed column stays visible',
            desc: '',
            column: 'archived',
            priority: '',
            subtasks: []
          }
        ]
      }}
    />
  ),
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('[data-slot="accordion-trigger"]')?.click()
  }
})
