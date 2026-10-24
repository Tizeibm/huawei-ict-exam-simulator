import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canChangeRole,
  canChangeStatus,
  decideRedirect,
  isActiveAdmin,
  isApproved,
  normalizeRole,
  normalizeStatus,
} from './access.ts'

const approved = { role: 'candidate', status: 'APPROVED' }
const admin = { role: 'admin', status: 'APPROVED' }

test('unknown or missing status is treated as PENDING (fail-closed)', () => {
  assert.equal(normalizeStatus(undefined), 'PENDING')
  assert.equal(normalizeStatus('whatever'), 'PENDING')
  assert.equal(normalizeStatus('approved'), 'APPROVED')
  assert.equal(normalizeRole(undefined), 'candidate')
  assert.equal(normalizeRole('ADMIN'), 'admin')
})

test('anonymous users can view public homepage and auth pages, but are sent to login for protected pages', () => {
  assert.equal(decideRedirect('/', false, null), null)
  assert.equal(decideRedirect('/login', false, null), null)
  assert.equal(decideRedirect('/signup', false, null), null)
  assert.equal(decideRedirect('/dashboard', false, null), '/login')
  assert.equal(decideRedirect('/exam', false, null), '/login')
  assert.equal(decideRedirect('/analytics', false, null), '/login')
  assert.equal(decideRedirect('/profile', false, null), '/login')
  assert.equal(decideRedirect('/results/123', false, null), '/login')
  assert.equal(decideRedirect('/admin', false, null), '/login')
})

test('pending, rejected and suspended users are confined to their status page', () => {
  for (const [status, page] of [
    ['PENDING', '/pending'],
    ['REJECTED', '/rejected'],
    ['SUSPENDED', '/suspended'],
  ] as const) {
    for (const path of ['/dashboard', '/exam', '/analytics', '/profile', '/admin', '/', '/login']) {
      assert.equal(decideRedirect(path, true, { role: 'candidate', status }), page)
    }
    assert.equal(decideRedirect(page, true, { role: 'candidate', status }), null)
  }
})

test('a missing profile row is treated as pending', () => {
  assert.equal(decideRedirect('/dashboard', true, null), '/pending')
  assert.equal(isApproved(null), false)
})

test('a role claimed by a non-approved account grants nothing', () => {
  assert.equal(decideRedirect('/admin', true, { role: 'admin', status: 'PENDING' }), '/pending')
  assert.equal(isActiveAdmin({ role: 'admin', status: 'SUSPENDED' }), false)
  assert.equal(isActiveAdmin({ role: 'admin', status: 'REJECTED' }), false)
})

test('approved candidates reach dashboard, exam, analytics, results, and profile, but NOT admin', () => {
  assert.equal(decideRedirect('/dashboard', true, approved), null)
  assert.equal(decideRedirect('/exam', true, approved), null)
  assert.equal(decideRedirect('/analytics', true, approved), null)
  assert.equal(decideRedirect('/profile', true, approved), null)
  assert.equal(decideRedirect('/results/abc', true, approved), null)
  assert.equal(decideRedirect('/admin', true, approved), '/dashboard')
  assert.equal(decideRedirect('/login', true, approved), '/dashboard')
  assert.equal(decideRedirect('/pending', true, approved), '/dashboard')
})

test('approved administrators can access BOTH admin console AND all candidate features (exam, dashboard, analytics, results, profile)', () => {
  assert.equal(decideRedirect('/admin', true, admin), null)
  assert.equal(decideRedirect('/dashboard', true, admin), null)
  assert.equal(decideRedirect('/exam', true, admin), null)
  assert.equal(decideRedirect('/analytics', true, admin), null)
  assert.equal(decideRedirect('/profile', true, admin), null)
  assert.equal(decideRedirect('/results/attempt-1', true, admin), null)
  assert.equal(decideRedirect('/login', true, admin), '/admin')
})

test('only active admins can change account status, and cannot lock themselves out', () => {
  assert.equal(canChangeStatus(approved, 'a', 'b', 'APPROVED'), false)
  assert.equal(canChangeStatus({ role: 'admin', status: 'PENDING' }, 'a', 'b', 'APPROVED'), false)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'APPROVED'), true)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'REJECTED'), true)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'SUSPENDED'), true)
  assert.equal(canChangeStatus(admin, 'a', 'b', 'ADMIN'), false)
  assert.equal(canChangeStatus(admin, 'a', 'a', 'SUSPENDED'), false)
  assert.equal(canChangeStatus(admin, 'a', 'a', 'REJECTED'), false)
})

test('only active admins can assign roles, and cannot demote their own account', () => {
  assert.equal(canChangeRole(approved, 'a', 'b', 'admin'), false)
  assert.equal(canChangeRole({ role: 'admin', status: 'SUSPENDED' }, 'a', 'b', 'admin'), false)
  assert.equal(canChangeRole(admin, 'a', 'b', 'admin'), true)
  assert.equal(canChangeRole(admin, 'a', 'b', 'candidate'), true)
  assert.equal(canChangeRole(admin, 'a', 'b', 'superadmin'), false)
  assert.equal(canChangeRole(admin, 'a', 'a', 'candidate'), false)
  assert.equal(canChangeRole(admin, 'a', 'a', 'admin'), true)
})
