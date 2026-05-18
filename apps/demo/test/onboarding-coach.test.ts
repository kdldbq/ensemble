import { describe, expect, it } from 'vitest'

describe('OnboardingCoach module-load', () => {
  it('evaluates without TDZ errors when STEPS references kbdCell', async () => {
    await expect(import('../src/components/OnboardingCoach')).resolves.toBeDefined()
  })
})
