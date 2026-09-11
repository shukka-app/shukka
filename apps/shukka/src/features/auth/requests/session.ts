import { mutationOptions } from '@tanstack/react-query'
import { api } from '~/lib/api.ts'

export type LoginVariables = { password: string }
export type SetupVariables = { password: string }
export type ChangePasswordVariables = { currentPassword: string; newPassword: string }

export function loginMutationOptions() {
  return mutationOptions({
    mutationFn: (variables: LoginVariables) => api.post('/api/admin/login', variables),
  })
}

export function logoutMutationOptions() {
  return mutationOptions({
    mutationFn: () => api.post('/api/admin/logout'),
  })
}

export function setupMutationOptions() {
  return mutationOptions({
    mutationFn: (variables: SetupVariables) => api.post('/api/admin/setup', variables),
  })
}

export function changePasswordMutationOptions() {
  return mutationOptions({
    mutationFn: (variables: ChangePasswordVariables) => api.post('/api/admin/password', variables),
  })
}
