import { describe, expect, it } from 'vitest'
import {
  formatAeroHookOutput,
  formatAeroRecallContext,
  parseAeroHookInput
} from './aero-agent-injection'

describe('parseAeroHookInput', () => {
  it('reads cwd and prompt from the hook JSON and ignores anything else', () => {
    expect(
      parseAeroHookInput('{"session_id":"s","cwd":"/repo","prompt":"fix it","extra":1}')
    ).toEqual({ cwd: '/repo', prompt: 'fix it' })
  })

  it('treats malformed or non-object input as no input', () => {
    expect(parseAeroHookInput('')).toEqual({})
    expect(parseAeroHookInput('not json')).toEqual({})
    expect(parseAeroHookInput('["cwd"]')).toEqual({})
    expect(parseAeroHookInput('{"cwd":5,"prompt":null}')).toEqual({})
  })
})

describe('hook output', () => {
  it('wraps the context in the hookSpecificOutput shape Claude Code reads', () => {
    expect(JSON.parse(formatAeroHookOutput('UserPromptSubmit', 'ctx "quoted"\nline'))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: 'ctx "quoted"\nline'
      }
    })
  })

  it('keeps the scars inside the NOT_YOU_AGAIN envelope AeroFortress writes', () => {
    const text = formatAeroRecallContext('[{"id":"A"}]')
    expect(text.startsWith('<NOT_YOU_AGAIN>\n')).toBe(true)
    expect(text.endsWith('\n</NOT_YOU_AGAIN>')).toBe(true)
    expect(text).toContain('\n[{"id":"A"}]\n')
  })
})
