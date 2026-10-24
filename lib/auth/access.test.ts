import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canChangeStatus, decideRedirect, isActiveAdmin, normalizeStatus } from './access.ts'

const approved = { role: 'candidate', status: 'APPROVED' }
const admin = { role: 'admin', status: 'APPROVED' }

test('unknown or missing status is treated as PENDING', () => {
  assert.equal(normalizeStatus(undefined), 'PENDING')
  assert.equal(normalizeStatus('whatever'), 'PENDING')
  assert.equal(normalizeStatus('approved'), 'APPROVED')
})

test('anonymous users are sent to login for protected pages', () => {
  assert.equal(decideRedirect('/dashboard', false, null), '/login')
  assert.equal(decideRedirect('/exam', false, null), '/login')
  assert.equal(decideRedirect('/admin', false, null), '/login')
  assert.equal(decideRedirect('/', false, null), '/login')
  assert.equal(decideRedirect('/signup', false, null), null)
})

test('pending, rejected and suspended users are confined to their status page', () => {
  for (const [status, page] of [['PENDING', '/pending'], ['REJECTED', '/rejected'], ['SUSPENDED', '/suspended']] as const) {
    for (const path of ['/dashboard', '/exam', '/admin', '/', '/login']) {
      assert.equal(decideRedirect(path, true, { role: 'candidate', status }), page)
    }
    assert.equal(decideRedirect(page, true, { role: 'candidate', status }), null)
  }
})

test('a missing profile row is treated as pending', () => {
  assert.equal(decideRedirect('/dashboard', true, null), '/pending')
})

test('a role claimed by a non-approved account grants nothing', () => {
  assert.equal(decideRedirect('/admin', true, { role: 'admin', status: 'PENDING' }), '/pending')
  assert.equal(isActiveAdmin({ role: 'admin', status: 'SUSPENDED' }), false)
})

test('approved candidates reach the dashboard and exam but not admin', () => {
  assert.equal(decideRedirect('/dashboard', true, approved), null)
  assert.equal(decideRedirect('/exam', true, approved), null)
  assert.equal(decideRedirect('/admin', true, approved), '/dashboard')
  assert.equal(decideRedirect('/login', true, approved), '/dashboard')
  assert.equal(decideRedirect('/pending', true, approved), '/dashboard')
})

test('approved admins land on the admin console', () => {
  assert.equal(decideRedirect('/admin', true, admin), null)
  assert.equal(decideRedirect('/login', true, admin), '/admin')
})

test('only active admins can change status, and not lock themselves out', () => {
  assert.equal(canChangeStatus(approved, 'a', 'b', 'APPROVED'), false)
  assert.equal(canChangeStatus({ role: 'admin', status: 'PENDING' }, 'a', 'b', 'APPROVED'), false)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'REJECTED'), true)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'SUSPENDED'), true)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'ADMIN'), false)
  assert.equal(canChangeStatus(admin, 'a', 'a', 'SUSPENDED'), false)
})
