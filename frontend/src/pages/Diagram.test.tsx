import { render, screen, waitFor } from '@testing-library/react'
import mermaid from 'mermaid'
import { vi } from 'vitest'
import Diagram from './Diagram'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), parse: vi.fn(), render: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

test('draws what mermaid renders, under the label', async () => {
  vi.mocked(mermaid.parse).mockResolvedValue({ diagramType: 'flowchart-v2', config: {} })
  vi.mocked(mermaid.render).mockResolvedValue({ svg: '<svg><text>fork()</text></svg>', diagramType: 'flowchart-v2' })
  render(<Diagram source={'flowchart LR\n  A["fork()"] --> B[child]'} label="Diagram for the fork question" />)
  const figure = await screen.findByRole('figure', { name: 'Diagram for the fork question' })
  await waitFor(() => expect(figure.querySelector('svg')).toHaveTextContent('fork()'))
  expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^diagram-[a-zA-Z0-9]+$/), 'flowchart LR\n  A["fork()"] --> B[child]')
})

test('a diagram that does not parse draws nothing at all', async () => {
  // parse resolves false under suppressErrors, but vi.mocked only sees the overload that throws instead
  vi.mocked(mermaid.parse).mockResolvedValue(false as unknown as Awaited<ReturnType<typeof mermaid.parse>>)
  const { container } = render(<Diagram source="flowchart LR\n  A[oops --> (((" label="Diagram" />)
  await waitFor(() => expect(container).toBeEmptyDOMElement())
  expect(mermaid.render).not.toHaveBeenCalled()
})

test('a render that throws draws nothing either', async () => {
  vi.mocked(mermaid.parse).mockResolvedValue({ diagramType: 'flowchart-v2', config: {} })
  vi.mocked(mermaid.render).mockRejectedValue(new Error('no layout'))
  const { container } = render(<Diagram source="flowchart LR\n  A --> B" label="Diagram" />)
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})
