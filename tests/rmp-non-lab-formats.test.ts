import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isNonLabEventFormat } from '../src/lib/rmpEventFilters'

test('the two non-lab RMP formats are recognised regardless of case, spacing or dash style', () => {
  for (const value of [
    'Train-The-Trainer',
    'train the trainer',
    'TRAIN_THE_TRAINER',
    '  Train-The-Trainer  ',
    'Train‐The‐Trainer',
    'Train—The—Trainer',
    'Custom Tech Event',
    'custom tech event',
    'CUSTOM-TECH-EVENT',
  ]) {
    assert.equal(isNonLabEventFormat(value), true, `expected non-lab: ${JSON.stringify(value)}`)
  }
})

test('real lab work stays in the roadmap and is never matched by title or acronym', () => {
  for (const value of [
    'New Lab Onboarding',
    'Lab Upgrade',
    'Onboarding',
    // Titles and loose acronyms must never classify a record.
    'Azure AI Lab for TTT',
    'TTT',
    'ttt',
    'Trainer',
    // Substrings and supersets are not the format itself.
    'Train-The-Trainer Onboarding',
    'Custom Tech Event Onboarding',
    'Custom',
  ]) {
    assert.equal(isNonLabEventFormat(value), false, `expected lab roadmap work: ${JSON.stringify(value)}`)
  }
})

test('absent or blank formats stay in the roadmap rather than silently disappearing', () => {
  // Manual roadmap rows carry no RMP format at all; they must never be hidden.
  for (const value of [null, undefined, '', '   ']) {
    assert.equal(isNonLabEventFormat(value), false, `expected visible: ${JSON.stringify(value)}`)
  }
})

test('the letter "s" and interior spacing survive normalisation', () => {
  // Guards a real bug: a mangled \s escape stripped every "s" from the format.
  assert.equal(isNonLabEventFormat('Custom Tech Event'), true)
  assert.equal(isNonLabEventFormat('Cutom Tech Event'), false)
  assert.equal(isNonLabEventFormat('CustomTechEvent'), false)
})
