import request from './request'

export const getRuntimeSettings = () => request.get('/runtime/settings')

export const saveRuntimeSettings = (data) => request.put('/runtime/settings', data)

export const getAuthRequests = (params) => request.get('/runtime/requests', { params })

export const approveAuthRequest = (id, data) => request.post(`/runtime/requests/${id}/approve`, data)

export const rejectAuthRequest = (id, data) => request.post(`/runtime/requests/${id}/reject`, data)

export const getAuthorizations = (params) => request.get('/runtime/authorizations', { params })

export const createAuthorization = (data) => request.post('/runtime/authorizations', data)

export const updateAuthorization = (id, data) => request.put(`/runtime/authorizations/${id}`, data)

export const deactivateAuthorization = (id) => request.post(`/runtime/authorizations/${id}/deactivate`)

export const activateAuthorization = (id) => request.post(`/runtime/authorizations/${id}/activate`)

export const deleteAuthorization = (id) => request.delete(`/runtime/authorizations/${id}`)

export const resetAuthorizationDevices = (id) => request.post(`/runtime/authorizations/${id}/reset-devices`)

export const getAuthorizationDevices = (params) => request.get('/runtime/devices', { params })

export const deactivateAuthorizationDevice = (id) => request.post(`/runtime/devices/${id}/deactivate`)

export const getRuntimeSessions = (params) => request.get('/runtime/sessions', { params })

export const getRuntimeEvents = (params) => request.get('/runtime/events', { params })

export const getRemoteModuleTemplate = () => request.get('/runtime/template/module')

export const getRemoteModuleScaffold = (scriptId) => request.get(`/runtime/remote/scripts/${scriptId}/scaffold/latest`)

export const getRemoteManifests = (scriptId) => request.get(`/runtime/remote/scripts/${scriptId}/manifest`)

export const saveRemoteManifest = (scriptId, data) => request.put(`/runtime/remote/scripts/${scriptId}/manifest`, data)

export const publishRemoteManifest = (scriptId, version) => request.post(`/runtime/remote/scripts/${scriptId}/manifest/${version}/publish`)

export const activateRemoteManifestModule = (scriptId, version, data) => request.post(`/runtime/remote/scripts/${scriptId}/manifest/${version}/activate-module`, data)

export const rollbackRemoteCore = (scriptId, data) => request.post(`/runtime/remote/scripts/${scriptId}/rollback`, data)

export const getRemoteModules = (scriptId) => request.get(`/runtime/remote/scripts/${scriptId}/modules`)

export const saveRemoteModule = (scriptId, data) => request.post(`/runtime/remote/scripts/${scriptId}/modules`, data)

export const getRemoteModuleCode = (id) => request.get(`/runtime/remote/modules/${id}/code`)

export const publishRemoteModule = (id) => request.post(`/runtime/remote/modules/${id}/publish`)

export const unpublishRemoteModule = (id) => request.post(`/runtime/remote/modules/${id}/unpublish`)
