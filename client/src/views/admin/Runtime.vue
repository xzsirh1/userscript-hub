<template>
  <div class="runtime-page">
    <el-card class="hero-card">
      <div class="hero-head">
        <div>
          <div class="hero-kicker">授权与运行时</div>
          <h2>远程授权与远程核心</h2>
          <p>先配置脚本连接地址，再维护远程核心版本；用户提交申请后，你也可以在这里审批、查看授权和设备状态。</p>
        </div>
        <el-button @click="reloadAllData">刷新全部</el-button>
      </div>

      <div class="summary-cards">
        <div class="summary-card warning">
          <span class="summary-label">待审批申请</span>
          <strong>{{ pendingRequestCount }}</strong>
          <small>等你决定是否放行</small>
        </div>
        <div class="summary-card success">
          <span class="summary-label">有效授权</span>
          <strong>{{ activeAuthorizationCount }}</strong>
          <small>当前还能继续使用</small>
        </div>
        <div class="summary-card primary">
          <span class="summary-label">在线会话</span>
          <strong>{{ activeSessionCount }}</strong>
          <small>10 分钟内仍有心跳的页面</small>
        </div>
        <div class="summary-card info">
          <span class="summary-label">已绑定设备</span>
          <strong>{{ activeDeviceCount }}</strong>
          <small>已经锁定过的机器</small>
        </div>
      </div>
    </el-card>

    <el-tabs v-model="activeTab" class="runtime-tabs">
      <el-tab-pane label="远程核心" name="remote-core">
        <el-card class="card-block">
          <template #header>
            <div class="card-header">
              <div>
                <strong>远程核心保护</strong>
                <p class="header-tip">先选一个脚本，再选择“傻瓜保护壳”或“高级远程模块”。新手只需要会上传脚本和点击发布。</p>
              </div>
              <div class="toolbar-right">
                <el-select v-model="remoteCoreState.scriptId" size="small" class="script-picker" placeholder="选择远程核心脚本" clearable @change="loadRemoteCoreData">
                  <el-option v-for="item in remoteCoreScriptOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
                <el-button size="small" @click="loadRemoteCoreData" :disabled="!remoteCoreState.scriptId">刷新</el-button>
              </div>
            </div>
          </template>

          <template v-if="remoteCoreState.scriptId">
            <div class="remote-overview">
              <div class="overview-chip">
                <span>当前脚本</span>
                <strong>{{ currentRemoteScriptName }}</strong>
              </div>
              <div class="overview-chip">
                <span>线上发布版</span>
                <strong>{{ latestPublishedManifest?.version || '暂无' }}</strong>
              </div>
              <div class="overview-chip">
                <span>线上代码版</span>
                <strong>{{ latestPublishedManifest?.active_module_version || '暂无' }}</strong>
              </div>
              <div class="overview-chip">
                <span>可用代码版</span>
                <strong>{{ publishedRemoteModules.length }}</strong>
              </div>
            </div>

            <div class="quickstart-card">
              <div class="quickstart-head">
                <strong>最简单的理解：用户装的是壳，你的核心代码留在服务器</strong>
                <p>傻瓜保护壳会把你上传的完整脚本整体包进去，并尽量自动保留 <code>@match</code>、<code>@grant</code>、<code>@require</code> 这类运行参数。它追求“少填、少懂、先跑通”，高级模式再给懂代码的人慢慢拆模块。</p>
              </div>
              <div class="quickstart-steps">
                <div class="quickstart-step">
                  <span>1</span>
                  <strong>上传一个原本就能跑的完整脚本</strong>
                  <small>AI 写的也可以，先别拆，先保证原版能正常运行。</small>
                </div>
                <div class="quickstart-step">
                  <span>2</span>
                  <strong>选择傻瓜保护壳</strong>
                  <small>系统自动生成入口壳，浏览器里只放壳和授权逻辑。</small>
                </div>
                <div class="quickstart-step">
                  <span>3</span>
                  <strong>点“一键保护并发布”</strong>
                  <small>系统会生成远程代码版、发布上线版，并做基础兼容提醒。</small>
                </div>
                <div class="quickstart-step">
                  <span>4</span>
                  <strong>发给用户安装</strong>
                  <small>用户更新时拿到的是壳，真正逻辑以后可以在后台换版本。</small>
                </div>
              </div>
            </div>

            <el-card shadow="never" class="inner-card remote-mode-card">
              <div class="mode-choice-head">
                <div>
                  <strong>你想用哪种方式保护脚本？</strong>
                  <p>两种方式都会保留。新手推荐左边，懂代码再用右边。</p>
                </div>
                <el-button text @click="$router.push('/admin/help')">查看帮助说明</el-button>
              </div>

              <el-radio-group v-model="remoteCoreWorkMode" class="mode-choice-grid">
                <el-radio-button label="simple">
                  <div class="mode-choice-item">
                    <strong>傻瓜保护壳</strong>
                    <span>把完整脚本包进去，自动保留头部参数，适合保护知识产权。</span>
                  </div>
                </el-radio-button>
                <el-radio-button label="advanced">
                  <div class="mode-choice-item">
                    <strong>高级远程模块</strong>
                    <span>手动维护代码版本和运行参数，适合后续精细热更新。</span>
                  </div>
                </el-radio-button>
              </el-radio-group>

              <div v-if="remoteCoreWorkMode === 'simple'" class="simple-protect-panel">
                <div>
                  <strong>推荐给小白的发布方式</strong>
                  <p>先用“傻瓜保护壳”跑通。系统会尽量自动解析脚本头部和常见能力，但不会承诺 100% 兼容所有极端写法；发现高风险写法时会提示你先复核。</p>
                </div>
                <div class="simple-actions">
                  <el-button :loading="applyingOneClickRemoteCore" @click="handleBuildRemoteScaffold" :disabled="!remoteCoreState.scriptId">只生成草稿，我先看看</el-button>
                  <el-button type="primary" :loading="applyingOneClickRemoteCore" @click="handleOneClickProtectAndPublish" :disabled="!remoteCoreState.scriptId">一键保护并发布</el-button>
                </div>
              </div>
            </el-card>

            <el-card v-if="remoteScaffoldAnalysis" shadow="never" class="inner-card scaffold-analysis-card">
              <template #header>
                <div class="card-header compact">
                  <div>
                    <strong>兼容性体检结果</strong>
                    <p class="header-tip">系统已经尽量自动包好脚本。这里只用人话告诉你：大概能不能直接上、哪里需要看一眼。</p>
                  </div>
                </div>
              </template>

              <div class="analysis-summary">
                <div class="analysis-chip">
                  <span>保护方式</span>
                  <strong>{{ remoteCompatibilityModeText }}</strong>
                </div>
                <div class="analysis-chip">
                  <span>正文行数</span>
                  <strong>{{ remoteScaffoldAnalysis.bodyLines }}</strong>
                </div>
                <div class="analysis-chip">
                  <span>上线建议</span>
                  <strong>{{ remoteScaffoldAnalysis.compatibility.manualReviewRequired ? '先检查再发布' : '可以先发布测试' }}</strong>
                </div>
              </div>

              <div class="analysis-block">
                <strong>识别到的能力</strong>
                <div class="tag-row">
                  <el-tag v-for="flag in remoteScaffoldAnalysis.featureFlags" :key="flag" size="small">{{ flag }}</el-tag>
                  <el-tag v-if="!remoteScaffoldAnalysis.featureFlags.length" size="small" type="info">未识别到特殊能力</el-tag>
                </div>
              </div>

              <div class="analysis-block" v-if="remoteScaffoldAnalysis.header.grants.length">
                <strong>头部授权</strong>
                <p class="analysis-text">{{ remoteScaffoldAnalysis.header.grants.join('、') }}</p>
              </div>

              <div class="analysis-block" v-if="remoteScaffoldAnalysis.selectors.length">
                <strong>选择器提醒</strong>
                <ul class="analysis-list">
                  <li v-for="item in remoteScaffoldAnalysis.selectors" :key="item">{{ item }}</li>
                </ul>
              </div>

              <div class="analysis-block" v-if="remoteScaffoldAnalysis.recommendations.length">
                <strong>配置化建议</strong>
                <ul class="analysis-list">
                  <li v-for="item in remoteScaffoldAnalysis.recommendations" :key="item">{{ item }}</li>
                </ul>
              </div>

              <el-alert
                v-if="remoteScaffoldAnalysis.warnings.length"
                type="warning"
                :closable="false"
                show-icon
                title="需要人工复核"
                class="analysis-alert"
              >
                <template #default>
                  <ul class="analysis-list compact">
                    <li v-for="item in remoteScaffoldAnalysis.warnings" :key="item">{{ item }}</li>
                  </ul>
                </template>
              </el-alert>
            </el-card>

            <el-card shadow="never" class="inner-card manifest-card">
              <template #header>
                <div class="card-header compact">
                  <div>
                    <strong>上线设置</strong>
                    <p class="header-tip">新手只看前四项就够了。下面的 JSON 属于高级设置，不懂可以先不展开。</p>
                  </div>
                </div>
              </template>

              <el-form :model="remoteManifestForm" class="manifest-form" :label-width="isCompactViewport ? 'auto' : '120px'" :label-position="isCompactViewport ? 'top' : 'right'">
                <el-form-item label="发布版本号">
                  <el-input v-model="remoteManifestForm.version" placeholder="例如 20.0.0" />
                </el-form-item>
                <el-form-item label="使用代码版">
                  <el-input v-model="remoteManifestForm.activeModuleVersion" placeholder="例如 20.0.0" />
                </el-form-item>
                <el-form-item label="保存方式">
                  <el-select v-model="remoteManifestForm.status" style="width: 100%">
                    <el-option label="先保存草稿，暂不上线" value="draft" />
                    <el-option label="保存后发布上线" value="published" />
                  </el-select>
                </el-form-item>
                <el-form-item label="版本说明">
                  <el-input v-model="remoteManifestForm.description" type="textarea" :rows="2" placeholder="例如：首次保护壳上线 / 修复登录按钮点击" />
                </el-form-item>
                <el-collapse v-model="remoteAdvancedPanels" class="advanced-collapse">
                  <el-collapse-item title="高级设置：站点规则和运行参数，不懂可以不用改" name="json">
                    <el-form-item label="站点规则">
                      <el-input v-model="remoteManifestJsonText" type="textarea" :rows="8" placeholder="高级用户才需要：页面路由、模块标识、站点规则等" />
                    </el-form-item>
                    <el-form-item label="运行参数">
                      <el-input v-model="remoteConfigJsonText" type="textarea" :rows="8" placeholder="高级用户才需要：选择器、文案、节奏参数等" />
                    </el-form-item>
                  </el-collapse-item>
                </el-collapse>
                <el-form-item>
                  <el-button type="primary" :loading="savingRemoteManifest" @click="handleSaveRemoteManifest">{{ remoteManifestForm.status === 'published' ? '保存并发布上线' : '保存草稿' }}</el-button>
                </el-form-item>
              </el-form>
            </el-card>

            <div class="remote-side-column" v-show="remoteCoreWorkMode === 'advanced'">
              <el-card shadow="never" class="inner-card">
                <template #header>
                  <div class="card-header compact">
                    <div>
                      <strong>高级远程模块</strong>
                      <p class="header-tip">这里给懂代码的人用。新手不用手填，优先回到“傻瓜保护壳”。</p>
                    </div>
                    <div class="toolbar-right">
                      <el-button size="small" @click="handleBuildRemoteScaffold" :disabled="!remoteCoreState.scriptId">一键生成草稿</el-button>
                      <el-button size="small" @click="handleFillTemplate" :disabled="!remoteCoreTemplate">填入模板</el-button>
                      <el-button size="small" type="primary" @click="openRemoteModuleDialog()">新建模块</el-button>
                    </div>
                  </div>
                </template>

                <el-table :data="remoteModules" v-loading="loadingRemoteModules" stripe>
                  <el-table-column prop="version" label="版本" width="110" />
                  <el-table-column prop="module_name" label="模块名称" min-width="180" />
                  <el-table-column prop="status" label="状态" width="110">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.status === 'published' ? 'success' : 'info'">{{ row.status === 'published' ? '已发布' : '草稿' }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="260">
                    <template #default="{ row }">
                      <el-button size="small" @click="openRemoteModuleDialog(row)">编辑</el-button>
                      <el-button size="small" @click="handleLoadRemoteModuleCode(row)">看代码</el-button>
                      <el-button v-if="row.status !== 'published'" size="small" type="success" @click="handlePublishRemoteModule(row)">发布</el-button>
                      <el-button v-else size="small" type="warning" @click="handleUnpublishRemoteModule(row)">转草稿</el-button>
                    </template>
                  </el-table-column>
                </el-table>

                <div class="remote-help">
                  <strong>高级模式说明</strong>
                  <p>模块至少导出 <code>bootstrap(context)</code>；可选 <code>destroy(context)</code> 和 <code>getHealth()</code>。如果只是想保护源码，不需要理解这些，直接用傻瓜保护壳。</p>
                </div>
              </el-card>

              <el-card shadow="never" class="inner-card">
                <template #header>
                  <div class="card-header compact">
                    <div>
                      <strong>历史版本</strong>
                      <p class="header-tip">这里用于查看过去版本、切换线上模块和快速回滚。</p>
                    </div>
                  </div>
                </template>

                <el-table :data="remoteManifests" stripe>
                  <el-table-column prop="version" label="版本" width="110" />
                  <el-table-column prop="status" label="状态" width="110">
                    <template #default="{ row }">
                      <el-tag size="small" :type="row.status === 'published' ? 'success' : 'info'">{{ row.status === 'published' ? '已发布' : '草稿' }}</el-tag>
                    </template>
                  </el-table-column>
                  <el-table-column prop="active_module_version" label="模块" width="120" />
                  <el-table-column prop="updated_at" label="更新时间" width="180" />
                  <el-table-column label="操作" width="380">
                    <template #default="{ row }">
                      <div class="table-actions-wrap">
                        <el-button size="small" @click="handleLoadManifest(row)">载入编辑区</el-button>
                        <el-button size="small" type="primary" @click="handlePublishManifest(row)" :disabled="row.status === 'published'">发布</el-button>
                        <el-dropdown @command="(moduleVersion) => handleActivateManifestModule(row, moduleVersion)">
                          <el-button size="small" type="warning">切换模块</el-button>
                          <template #dropdown>
                            <el-dropdown-menu>
                              <el-dropdown-item v-for="module in publishedRemoteModules" :key="module.id" :command="module.version">{{ module.version }}</el-dropdown-item>
                            </el-dropdown-menu>
                          </template>
                        </el-dropdown>
                        <el-button size="small" type="danger" @click="handleRollbackRemoteCore(row)">回滚到此版</el-button>
                      </div>
                    </template>
                  </el-table-column>
                </el-table>
              </el-card>
            </div>
          </template>
          <el-empty v-else description="先在脚本管理里把脚本设成远程核心，再回来继续配置" />
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="授权审批" name="requests">
        <el-card class="card-block">
          <template #header>
            <div class="card-header">
              <div>
                <strong>用户申请</strong>
                <p class="header-tip">这里处理“某个用户想用脚本”的请求。批准后，脚本就能继续激活使用。</p>
              </div>
              <div class="toolbar-right">
                <el-select v-model="requestFilters.scriptId" size="small" style="width: 180px" clearable @change="loadRequests">
                  <el-option v-for="item in scriptOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
                <el-select v-model="requestStatus" size="small" style="width: 160px" @change="loadRequests">
                  <el-option label="全部状态" value="" />
                  <el-option label="待你审批" value="pending" />
                  <el-option label="已批准" value="approved" />
                  <el-option label="已拒绝" value="rejected" />
                </el-select>
              </div>
            </div>
          </template>

          <el-table :data="requests" v-loading="loadingRequests" stripe>
            <el-table-column prop="script_name" label="脚本" min-width="160" />
            <el-table-column prop="applicant_name" label="申请人" width="120" />
            <el-table-column prop="contact" label="联系方式" min-width="140" />
            <el-table-column prop="purpose" label="用途说明" min-width="180" show-overflow-tooltip />
            <el-table-column prop="device_summary" label="申请设备" min-width="220" show-overflow-tooltip />
            <el-table-column prop="status" label="审批状态" width="100">
              <template #default="{ row }">
                <el-tag :type="requestStatusType(row.status)" size="small">{{ requestStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="申请时间" width="180" />
            <el-table-column label="操作" width="260" fixed="right">
              <template #default="{ row }">
                <el-button v-if="row.status === 'pending'" size="small" type="primary" @click="openApproveDialog(row)">批准使用</el-button>
                <el-button v-if="row.status === 'pending'" size="small" type="danger" @click="handleReject(row)">拒绝</el-button>
                <el-button size="small" @click="openDetail('request', row)">查看详情</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="授权管理" name="authorizations">
        <el-card class="card-block">
          <template #header>
            <div class="card-header">
              <div>
                <strong>授权管理</strong>
                <p class="header-tip">这里维护授权的完整生命周期。你可以停用、清除绑定、查看详情，必要时再删除测试或脏数据。</p>
              </div>
              <div class="toolbar-right">
                <el-select v-model="authorizationFilters.scriptId" size="small" style="width: 180px" clearable @change="loadAuthorizations">
                  <el-option v-for="item in scriptOptions" :key="item.id" :label="item.name" :value="item.id" />
                </el-select>
                <el-select v-model="authorizationFilters.status" size="small" style="width: 140px" clearable @change="loadAuthorizations">
                  <el-option label="有效中" value="approved" />
                  <el-option label="已停用" value="disabled" />
                  <el-option label="已过期" value="expired" />
                </el-select>
                <el-input v-model="authorizationFilters.keyword" size="small" clearable placeholder="搜授权码/使用人" style="width: 180px" @keyup.enter="loadAuthorizations" @clear="loadAuthorizations" />
                <el-button size="small" type="primary" @click="openAuthorizationDialog()">手动新增授权</el-button>
              </div>
            </div>
          </template>

            <el-table :data="authorizations" v-loading="loadingAuthorizations" stripe>
              <el-table-column prop="script_name" label="脚本" min-width="160" />
              <el-table-column prop="authorization_code" label="授权码" min-width="180" />
              <el-table-column prop="applicant_name" label="使用人" width="120" />
            <el-table-column prop="status" label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="authorizationStatusType(row.status)" size="small">{{ authorizationStatusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
              <el-table-column label="绑定占用" width="110">
                <template #default="{ row }">{{ row.active_device_count }}/{{ row.device_limit }}</template>
              </el-table-column>
            <el-table-column prop="last_active_at" label="最近活跃" width="180" />
            <el-table-column prop="expires_at" label="到期时间" width="180" />
              <el-table-column label="操作" width="510" fixed="right">
                <template #default="{ row }">
                  <div class="table-actions-wrap inline-actions">
                    <el-button size="small" @click="openAuthorizationDialog(row)">编辑</el-button>
                    <el-button size="small" @click="handleCopyCode(row.authorization_code)">复制</el-button>
                    <el-button v-if="row.status === 'approved'" size="small" type="danger" @click="handleDeactivateAuthorization(row)">停用</el-button>
                    <el-button v-else size="small" type="success" @click="handleActivateAuthorization(row)">启用</el-button>
                    <el-button size="small" type="warning" @click="handleResetDevices(row)">清除绑定</el-button>
                    <el-button size="small" type="danger" plain @click="handleDeleteAuthorization(row)">删除</el-button>
                    <el-button size="small" @click="openDetail('authorization', row)">详情</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="设备与在线" name="devices">
        <div class="runtime-stack-grid">
          <el-card class="card-block">
            <template #header>
              <div class="card-header">
                <div>
                  <strong>已绑定设备</strong>
                  <p class="header-tip">这里看授权当前绑到了哪台机器。解绑后，用户下次运行会重新激活并绑定。</p>
                </div>
                <div class="toolbar-right">
                  <el-select v-model="deviceFilters.status" size="small" style="width: 140px" clearable @change="loadDevices">
                    <el-option label="正在使用" value="active" />
                    <el-option label="已解绑" value="revoked" />
                  </el-select>
                  <el-input v-model="deviceFilters.keyword" size="small" clearable placeholder="搜设备/使用人" style="width: 180px" @keyup.enter="loadDevices" @clear="loadDevices" />
                  <el-button size="small" @click="loadDevices">刷新</el-button>
                </div>
              </div>
            </template>
            <el-table :data="devices" v-loading="loadingDevices" stripe>
              <el-table-column prop="script_name" label="脚本" min-width="120" show-overflow-tooltip />
              <el-table-column prop="authorization_code" label="授权码" min-width="150" show-overflow-tooltip />
              <el-table-column prop="applicant_name" label="使用人" width="120" show-overflow-tooltip />
              <el-table-column prop="device_summary" label="设备摘要" min-width="220" show-overflow-tooltip />
              <el-table-column prop="last_seen_at" label="最近上报" width="170" />
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <div class="table-actions-wrap inline-actions small-gap">
                    <el-button size="small" @click="openDetail('device', row)">详情</el-button>
                    <el-button v-if="row.status === 'active'" size="small" type="danger" @click="handleDeactivateDevice(row)">解绑</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card class="card-block">
            <template #header>
              <div class="card-header">
                <div>
                  <strong>在线会话</strong>
                  <p class="header-tip">这里只显示 10 分钟内仍有心跳的页面，过期后会自动移除。</p>
                </div>
                <div class="toolbar-right">
                  <el-select v-model="sessionFilters.status" size="small" style="width: 140px" clearable @change="loadSessions">
                    <el-option label="运行中" value="active" />
                    <el-option label="已结束" value="ended" />
                  </el-select>
                  <el-input v-model="sessionFilters.keyword" size="small" clearable placeholder="搜脚本/设备" style="width: 180px" @keyup.enter="loadSessions" @clear="loadSessions" />
                  <el-button size="small" @click="loadSessions">刷新</el-button>
                </div>
              </div>
            </template>
            <el-table :data="sessions" v-loading="loadingSessions" stripe>
              <el-table-column prop="script_name" label="脚本" min-width="120" show-overflow-tooltip />
              <el-table-column prop="authorization_code" label="授权码" min-width="140" show-overflow-tooltip />
              <el-table-column prop="applicant_name" label="使用人" width="120" show-overflow-tooltip />
              <el-table-column prop="device_summary" label="设备摘要" min-width="220" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="90">
                <template #default="{ row }">{{ sessionStatusText(row.status) }}</template>
              </el-table-column>
              <el-table-column prop="duration_seconds" label="时长" width="90">
                <template #default="{ row }">{{ formatDuration(row.duration_seconds) }}</template>
              </el-table-column>
              <el-table-column prop="last_heartbeat_at" label="最近心跳" width="170" />
              <el-table-column label="详情" width="90" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="openDetail('session', row)">查看</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </div>
      </el-tab-pane>

      <el-tab-pane label="最近记录" name="events">
        <el-card class="card-block">
          <template #header>
            <div class="card-header">
              <div>
                  <strong>最近记录</strong>
                  <p class="header-tip">这里能快速排查：用户有没有申请、有没有激活、页面有没有启动、有没有报错。</p>
              </div>
              <div class="toolbar-right">
                <el-select v-model="eventFilters.eventType" size="small" style="width: 160px" clearable @change="loadEvents">
                    <el-option label="提交申请" value="auth_request" />
                  <el-option label="激活成功" value="auth_success" />
                    <el-option label="脚本启动" value="startup" />
                  <el-option label="会话开始" value="session_start" />
                    <el-option label="心跳" value="heartbeat" />
                    <el-option label="授权失败" value="auth_reject" />
                    <el-option label="运行错误" value="runtime_error" />
                </el-select>
                  <el-input v-model="eventFilters.keyword" size="small" clearable placeholder="搜脚本/页面" style="width: 180px" @keyup.enter="loadEvents" @clear="loadEvents" />
                  <el-button size="small" @click="loadEvents">刷新</el-button>
              </div>
            </div>
          </template>

            <el-table :data="events" v-loading="loadingEvents" stripe>
              <el-table-column prop="script_name" label="脚本" min-width="140" show-overflow-tooltip />
              <el-table-column prop="authorization_code" label="授权码" min-width="140" show-overflow-tooltip />
              <el-table-column prop="event_type" label="记录类型" width="120">
                <template #default="{ row }">{{ eventTypeText(row.event_type) }}</template>
              </el-table-column>
              <el-table-column prop="current_url" label="当前页面" min-width="180" show-overflow-tooltip />
              <el-table-column label="摘要" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">{{ formatEventPayload(row.event_payload, row.event_type) }}</template>
              </el-table-column>
              <el-table-column prop="created_at" label="时间" width="170" />
              <el-table-column label="详情" width="90" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" @click="openDetail('event', row)">查看</el-button>
                </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

      <el-drawer v-model="detailVisible" :title="detailTitle" size="760px">
      <el-descriptions :column="1" border v-if="detailData">
        <el-descriptions-item v-for="item in detailItems" :key="item.label" :label="item.label">
          <pre v-if="item.pre" class="detail-pre">{{ item.value }}</pre>
          <span v-else>{{ item.value }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-drawer>

    <el-dialog v-model="approveDialogVisible" title="审批授权申请" width="520px">
      <el-form :model="approveForm" label-width="100px">
        <el-form-item label="脚本">
          <el-input :model-value="currentRequest?.script_name || ''" disabled />
        </el-form-item>
        <el-form-item label="使用人">
          <el-input :model-value="currentRequest?.applicant_name || ''" disabled />
        </el-form-item>
        <el-form-item label="授权码">
          <el-input v-model="approveForm.authorizationCode" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="设备数">
          <el-input-number v-model="approveForm.deviceLimit" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="允许换绑">
          <el-switch v-model="approveForm.allowRebind" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker v-model="approveForm.expiresAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="可留空" style="width: 100%" />
        </el-form-item>
        <el-form-item label="审批备注">
          <el-input v-model="approveForm.reviewNote" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approveDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="approving" @click="handleApprove">确认审批</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="authorizationDialogVisible" :title="editingAuthorization ? '编辑授权' : '创建授权'" width="520px">
      <el-form :model="authorizationForm" label-width="100px">
        <el-form-item label="脚本">
          <el-select v-model="authorizationForm.scriptId" placeholder="请选择脚本" style="width: 100%" :disabled="!!editingAuthorization">
            <el-option v-for="item in scriptOptions" :key="item.id" :label="item.name" :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="使用人">
          <el-input v-model="authorizationForm.applicantName" />
        </el-form-item>
        <el-form-item label="联系方式">
          <el-input v-model="authorizationForm.contact" />
        </el-form-item>
        <el-form-item v-if="!editingAuthorization" label="授权码">
          <el-input v-model="authorizationForm.authorizationCode" placeholder="留空自动生成" />
        </el-form-item>
        <el-form-item label="设备数">
          <el-input-number v-model="authorizationForm.deviceLimit" :min="1" :max="10" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="authorizationForm.status" style="width: 100%">
            <el-option label="已批准" value="approved" />
            <el-option label="已停用" value="disabled" />
            <el-option label="已过期" value="expired" />
          </el-select>
        </el-form-item>
        <el-form-item label="允许换绑">
          <el-switch v-model="authorizationForm.allowRebind" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker v-model="authorizationForm.expiresAt" type="datetime" value-format="YYYY-MM-DD HH:mm:ss" placeholder="可留空" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="authorizationForm.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="authorizationDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingAuthorization" @click="handleSaveAuthorization">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="remoteModuleDialogVisible" :title="editingRemoteModule ? '编辑远程模块' : '新建远程模块'" width="720px">
      <el-form :model="remoteModuleForm" label-width="110px">
        <el-form-item label="模块版本">
          <el-input v-model="remoteModuleForm.version" placeholder="例如 1.0.0" />
        </el-form-item>
        <el-form-item label="模块名称">
          <el-input v-model="remoteModuleForm.moduleName" />
        </el-form-item>
        <el-form-item label="入口函数">
          <el-input v-model="remoteModuleForm.entryName" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="remoteModuleForm.status" style="width: 100%">
            <el-option label="草稿" value="draft" />
            <el-option label="已发布" value="published" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="remoteModuleForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="模块代码">
          <el-input v-model="remoteModuleForm.code" type="textarea" :rows="14" placeholder="请输入远程模块代码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="remoteModuleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRemoteModule" @click="handleSaveRemoteModule">保存模块</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getScripts } from '@/api/scripts'
import {
  activateAuthorization,
  approveAuthRequest,
  createAuthorization,
  deleteAuthorization,
  deactivateAuthorization,
  deactivateAuthorizationDevice,
  getAuthRequests,
  getAuthorizationDevices,
  getAuthorizations,
  getRemoteManifests,
  getRemoteModuleCode,
  getRemoteModuleScaffold,
  getRemoteModuleTemplate,
  getRemoteModules,
  getRuntimeEvents,
  getRuntimeSessions,
  getRuntimeSettings,
  publishRemoteManifest,
  publishRemoteModule,
  rollbackRemoteCore,
  resetAuthorizationDevices,
  rejectAuthRequest,
  saveRemoteManifest,
  saveRemoteModule,
  saveRuntimeSettings,
  activateRemoteManifestModule,
  unpublishRemoteModule,
  updateAuthorization
} from '@/api/runtime'

const settingsForm = reactive({
  runtimeBaseUrl: '',
  runtimeManifestUrl: '',
  heartbeatInterval: 120,
  offlineGraceMinutes: 30
})
const activeTab = ref('remote-core')
const fallbackUrlsText = ref('')
const savingSettings = ref(false)
const isCompactViewport = ref(false)

const requests = ref([])
const requestStatus = ref('pending')
const loadingRequests = ref(false)
const requestFilters = reactive({ scriptId: null })

const authorizations = ref([])
const loadingAuthorizations = ref(false)
const authorizationFilters = reactive({ scriptId: null, status: '', keyword: '' })

const devices = ref([])
const loadingDevices = ref(false)
const deviceFilters = reactive({ status: '', keyword: '' })

const sessions = ref([])
const loadingSessions = ref(false)
const sessionFilters = reactive({ status: '', keyword: '' })

const events = ref([])
const loadingEvents = ref(false)
const eventFilters = reactive({ eventType: '', keyword: '' })

const scriptOptions = ref([])
const remoteCoreState = reactive({ scriptId: null })
const remoteManifests = ref([])
const remoteModules = ref([])
const loadingRemoteModules = ref(false)
const savingRemoteManifest = ref(false)
const savingRemoteModule = ref(false)
const applyingOneClickRemoteCore = ref(false)
const remoteCoreTemplate = ref('')
const remoteScaffoldAnalysis = ref(null)
const remoteCoreWorkMode = ref('simple')
const remoteAdvancedPanels = ref([])
const remoteManifestForm = reactive({ version: '', activeModuleVersion: '', status: 'draft', description: '' })
const remoteManifestJsonText = ref('{}')
const remoteConfigJsonText = ref('{}')
const remoteModuleDialogVisible = ref(false)
const editingRemoteModule = ref(null)
const remoteModuleForm = reactive({ version: '', moduleName: '', entryName: 'bootstrap', status: 'draft', description: '', code: '' })

const approveDialogVisible = ref(false)
const approving = ref(false)
const currentRequest = ref(null)
const approveForm = reactive({
  authorizationCode: '',
  deviceLimit: 1,
  allowRebind: true,
  expiresAt: '',
  reviewNote: ''
})

const authorizationDialogVisible = ref(false)
const savingAuthorization = ref(false)
const editingAuthorization = ref(null)
const authorizationForm = reactive({
  scriptId: null,
  applicantName: '',
  contact: '',
  authorizationCode: '',
  deviceLimit: 1,
  status: 'approved',
  allowRebind: true,
  expiresAt: '',
  remark: ''
})

const requestStatusType = (status) => ({ pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'info')
const requestStatusText = (status) => ({ pending: '待审批', approved: '已批准', rejected: '已拒绝' }[status] || status)
const authorizationStatusType = (status) => ({ approved: 'success', disabled: 'danger', expired: 'warning' }[status] || 'info')
const authorizationStatusText = (status) => ({ approved: '有效', disabled: '停用', expired: '过期' }[status] || status)
const sessionStatusText = (status) => ({ active: '在线', ended: '已结束' }[status] || status)
const eventTypeText = (type) => ({
  auth_request: '提交申请',
  auth_success: '激活成功',
  startup: '脚本启动',
  session_start: '会话开始',
  heartbeat: '心跳上报',
  auth_reject: '授权失败',
  runtime_error: '运行错误',
  shutdown: '脚本退出'
}[type] || type)

const detailVisible = ref(false)
const detailTitle = ref('详情')
const detailData = ref(null)

const detailItems = computed(() => {
  if (!detailData.value) return []
  const labelMap = {
    id: '记录 ID',
    script_id: '脚本 ID',
    script_name: '脚本名称',
    applicant_name: '使用人',
    contact: '联系方式',
    purpose: '用途说明',
    remark: '备注',
    device_fingerprint: '设备指纹',
    device_label: '原始设备标签',
    device_summary: '设备摘要',
    allow_rebind: '允许重新绑定',
    status: '状态',
    review_note: '审批备注',
    reviewed_by: '审批人',
    reviewed_at: '审批时间',
    authorization_id: '授权记录 ID',
    authorization_code: '授权码',
    current_url: '当前页面',
    session_id: '会话 ID',
    event_type: '记录类型',
    event_payload: '详细内容',
    device_id: '设备记录 ID',
    session_token: '会话令牌',
    runtime_version: '运行时版本',
    started_at: '开始时间',
    last_heartbeat_at: '最近心跳',
    ended_at: '结束时间',
    duration_seconds: '持续时长(秒)',
    created_at: '创建时间',
    updated_at: '更新时间',
    expires_at: '到期时间',
    last_active_at: '最近活跃',
    last_activated_at: '首次激活',
    active_device_count: '已占用设备数',
    device_limit: '设备上限'
  }
  return Object.entries(detailData.value).map(([label, value]) => ({
    label: labelMap[label] || label,
    value: typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(formatDetailValue(label, value) ?? '-'),
    pre: typeof value === 'object' && value !== null
  }))
})

const parsedFallbackUrls = computed(() => fallbackUrlsText.value.split('\n').map(item => item.trim()).filter(Boolean))
const remoteCoreScriptOptions = computed(() => scriptOptions.value.filter(item => item.release_mode === 'remote_core'))
const publishedRemoteModules = computed(() => remoteModules.value.filter(item => item.status === 'published'))
const currentRemoteScriptName = computed(() => scriptOptions.value.find(item => item.id === remoteCoreState.scriptId)?.name || '未选择脚本')
const latestPublishedManifest = computed(() => remoteManifests.value.find(item => item.status === 'published') || null)
const pendingRequestCount = computed(() => requests.value.filter(item => item.status === 'pending').length)
const activeAuthorizationCount = computed(() => authorizations.value.filter(item => item.status === 'approved').length)
const activeSessionCount = computed(() => sessions.value.filter(item => item.status === 'active').length)
const activeDeviceCount = computed(() => devices.value.filter(item => item.status === 'active').length)
const remoteCompatibilityModeText = computed(() => {
  if (!remoteScaffoldAnalysis.value) return '完整脚本保护壳'
  return remoteScaffoldAnalysis.value.releaseMode === 'remote_core' ? '完整脚本保护壳' : '保留头部的保护版'
})

const syncViewport = () => {
  isCompactViewport.value = window.innerWidth <= 768
}

const loadScriptOptions = async () => {
  const res = await getScripts({ page: 1, limit: 999 })
  if (res.code === 200) {
    scriptOptions.value = res.data.list
    if (!remoteCoreState.scriptId) {
      remoteCoreState.scriptId = remoteCoreScriptOptions.value[0]?.id || null
    }
  }
}

const reloadAllData = async () => {
  await Promise.all([
    loadRuntimeData(),
    loadScriptOptions(),
    loadRequests(),
    loadAuthorizations(),
    loadDevices(),
    loadSessions(),
    loadEvents()
  ])

  if (remoteCoreState.scriptId) {
    await loadRemoteCoreData()
  }
}

const loadRemoteCoreData = async () => {
  remoteScaffoldAnalysis.value = null
  if (!remoteCoreState.scriptId) {
    remoteManifests.value = []
    remoteModules.value = []
    return
  }

  loadingRemoteModules.value = true
  try {
    const [manifestRes, moduleRes, templateRes] = await Promise.all([
      getRemoteManifests(remoteCoreState.scriptId),
      getRemoteModules(remoteCoreState.scriptId),
      remoteCoreTemplate.value ? Promise.resolve({ code: 200, data: { content: remoteCoreTemplate.value } }) : getRemoteModuleTemplate()
    ])
    if (manifestRes.code === 200) {
      remoteManifests.value = manifestRes.data
      const latestManifest = manifestRes.data[0]
      if (latestManifest) {
        remoteManifestForm.version = latestManifest.version || ''
        remoteManifestForm.activeModuleVersion = latestManifest.active_module_version || ''
        remoteManifestForm.status = latestManifest.status || 'draft'
        remoteManifestForm.description = latestManifest.description || ''
        remoteManifestJsonText.value = JSON.stringify(latestManifest.manifest_json || {}, null, 2)
        remoteConfigJsonText.value = JSON.stringify(latestManifest.remote_config_json || {}, null, 2)
      }
    }
    if (moduleRes.code === 200) {
      remoteModules.value = moduleRes.data
    }
    if (templateRes.code === 200) {
      remoteCoreTemplate.value = templateRes.data.content
    }
  } finally {
    loadingRemoteModules.value = false
  }
}

const handleLoadManifest = (manifest) => {
  remoteManifestForm.version = manifest.version || ''
  remoteManifestForm.activeModuleVersion = manifest.active_module_version || ''
  remoteManifestForm.status = manifest.status || 'draft'
  remoteManifestForm.description = manifest.description || ''
  remoteManifestJsonText.value = JSON.stringify(manifest.manifest_json || {}, null, 2)
  remoteConfigJsonText.value = JSON.stringify(manifest.remote_config_json || {}, null, 2)
}

const loadRuntimeData = async () => {
  const res = await getRuntimeSettings()
  if (res.code === 200) {
    settingsForm.runtimeBaseUrl = res.data.runtimeBaseUrl || ''
    settingsForm.runtimeManifestUrl = res.data.runtimeManifestUrl || ''
    settingsForm.heartbeatInterval = res.data.heartbeatInterval || 120
    settingsForm.offlineGraceMinutes = res.data.offlineGraceMinutes || 30
    fallbackUrlsText.value = (res.data.fallbackUrls || []).join('\n')
  }
}

const handleSaveSettings = async () => {
  savingSettings.value = true
  try {
    const res = await saveRuntimeSettings({
      ...settingsForm,
      fallbackUrls: parsedFallbackUrls.value
    })
    if (res.code === 200) {
      ElMessage.success('运行时配置已保存')
      await loadRuntimeData()
    }
  } finally {
    savingSettings.value = false
  }
}

const handleSaveRemoteManifest = async () => {
  if (!remoteCoreState.scriptId || !remoteManifestForm.version.trim()) {
    ElMessage.warning('请先选择脚本并填写发布版本号')
    return false
  }

  if (remoteManifestForm.status === 'published' && !remoteManifestForm.activeModuleVersion.trim()) {
    ElMessage.warning('发布上线前需要先选择一个代码版本')
    return false
  }

  const shouldPublishAfterSave = remoteManifestForm.status === 'published'
  const saveStatus = shouldPublishAfterSave ? 'draft' : 'draft'

  if (shouldPublishAfterSave) {
    const targetModule = remoteModules.value.find(item => item.version === remoteManifestForm.activeModuleVersion)
    if (!targetModule || targetModule.status !== 'published') {
      ElMessage.warning('使用的代码版还没有发布，请先发布代码版，或使用“一键保护并发布”')
      return false
    }
  }

  let manifest
  let runtimeConfig
  try {
    manifest = JSON.parse(remoteManifestJsonText.value || '{}')
    runtimeConfig = JSON.parse(remoteConfigJsonText.value || '{}')
  } catch (error) {
    ElMessage.error('高级设置里的 JSON 格式不对，请展开检查')
    remoteAdvancedPanels.value = ['json']
    return false
  }

  savingRemoteManifest.value = true
  try {
    const res = await saveRemoteManifest(remoteCoreState.scriptId, {
      version: remoteManifestForm.version,
      activeModuleVersion: remoteManifestForm.activeModuleVersion,
      status: saveStatus,
      description: remoteManifestForm.description,
      manifest,
      runtimeConfig
    })
    if (res.code !== 200) return false

    if (shouldPublishAfterSave) {
      const publishRes = await publishRemoteManifest(remoteCoreState.scriptId, remoteManifestForm.version)
      if (publishRes.code !== 200) return false
      ElMessage.success('已保存并发布上线')
    } else {
      ElMessage.success('草稿已保存')
    }
    await loadRemoteCoreData()
    return true
  } finally {
    savingRemoteManifest.value = false
  }
}

const fillRemoteManifestFromScaffold = (payload = {}, options = {}) => {
  remoteManifestForm.version = payload.manifestVersion || payload.moduleVersion || remoteManifestForm.version
  remoteManifestForm.activeModuleVersion = payload.moduleVersion || remoteManifestForm.activeModuleVersion
  remoteManifestForm.description = payload.description || remoteManifestForm.description || '傻瓜保护壳自动生成版本'
  remoteManifestForm.status = options.status || remoteManifestForm.status || 'draft'
  if (remoteConfigJsonText.value === '{}' || !remoteConfigJsonText.value.trim() || options.forceRuntimeConfig) {
    remoteConfigJsonText.value = JSON.stringify(payload.runtimeConfig || {}, null, 2)
  }
}

const handleOneClickProtectAndPublish = async () => {
  if (!remoteCoreState.scriptId) {
    ElMessage.warning('请先选择一个远程核心脚本')
    return
  }

  applyingOneClickRemoteCore.value = true
  try {
    const scaffoldRes = await getRemoteModuleScaffold(remoteCoreState.scriptId)
    if (scaffoldRes.code !== 200) return

    const payload = scaffoldRes.data || {}
    remoteScaffoldAnalysis.value = payload.analysis || null
    const needsReview = !!payload.analysis?.compatibility?.manualReviewRequired
    if (needsReview) {
      try {
        await ElMessageBox.confirm(
          '系统发现这个脚本里有一些高风险写法，建议先生成草稿测试。你仍然可以继续发布，但发布后请立刻用真实页面验证。',
          '建议先复核',
          { type: 'warning', confirmButtonText: '继续发布', cancelButtonText: '先不发布' }
        )
      } catch (error) {
        ElMessage.info('已取消发布，你可以先生成草稿检查')
        return
      }
    }

    const moduleRes = await saveRemoteModule(remoteCoreState.scriptId, {
      version: payload.moduleVersion,
      moduleName: payload.moduleName,
      entryName: 'bootstrap',
      status: 'published',
      description: payload.description || '傻瓜保护壳自动生成代码版',
      code: payload.content
    })
    if (moduleRes.code !== 200) return

    fillRemoteManifestFromScaffold(payload, { status: 'published', forceRuntimeConfig: true })
    const manifestRes = await saveRemoteManifest(remoteCoreState.scriptId, {
      version: remoteManifestForm.version,
      activeModuleVersion: remoteManifestForm.activeModuleVersion,
      status: 'draft',
      description: remoteManifestForm.description,
      manifest: JSON.parse(remoteManifestJsonText.value || '{}'),
      runtimeConfig: JSON.parse(remoteConfigJsonText.value || '{}')
    })
    if (manifestRes.code !== 200) return

    const publishRes = await publishRemoteManifest(remoteCoreState.scriptId, remoteManifestForm.version)
    if (publishRes.code === 200) {
      ElMessage.success('傻瓜保护壳已生成并发布上线')
      await loadRemoteCoreData()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
      ElMessage.error('一键保护发布失败，请先生成草稿检查')
    }
  } finally {
    applyingOneClickRemoteCore.value = false
  }
}

const handlePublishManifest = async (manifest) => {
  const res = await publishRemoteManifest(remoteCoreState.scriptId, manifest.version)
  if (res.code === 200) {
    ElMessage.success('Manifest 已发布')
    loadRemoteCoreData()
  }
}

const handleActivateManifestModule = async (manifest, moduleVersion) => {
  const res = await activateRemoteManifestModule(remoteCoreState.scriptId, manifest.version, { moduleVersion })
  if (res.code === 200) {
    ElMessage.success('Manifest 指向模块已切换')
    loadRemoteCoreData()
  }
}

const handleRollbackRemoteCore = async (manifest) => {
  try {
    await ElMessageBox.confirm(`确定将远程核心回滚到 Manifest ${manifest.version} 吗？`, '提示', { type: 'warning' })
    const res = await rollbackRemoteCore(remoteCoreState.scriptId, { manifestVersion: manifest.version })
    if (res.code === 200) {
      ElMessage.success('已回滚到目标 Manifest')
      loadRemoteCoreData()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const resetRemoteModuleForm = () => {
  remoteModuleForm.version = ''
  remoteModuleForm.moduleName = ''
  remoteModuleForm.entryName = 'bootstrap'
  remoteModuleForm.status = 'draft'
  remoteModuleForm.description = ''
  remoteModuleForm.code = ''
}

const openRemoteModuleDialog = (row = null) => {
  editingRemoteModule.value = row
  resetRemoteModuleForm()
  if (row) {
    remoteModuleForm.version = row.version
    remoteModuleForm.moduleName = row.module_name
    remoteModuleForm.entryName = row.entry_name || 'bootstrap'
    remoteModuleForm.status = row.status || 'draft'
    remoteModuleForm.description = row.description || ''
  }
  remoteModuleDialogVisible.value = true
}

const handleLoadRemoteModuleCode = async (row) => {
  const res = await getRemoteModuleCode(row.id)
  if (res.code === 200) {
    openRemoteModuleDialog(row)
    remoteModuleForm.code = res.data.code || ''
  }
}

const handleFillTemplate = () => {
  if (!remoteCoreTemplate.value) return
  if (!remoteModuleDialogVisible.value) {
    openRemoteModuleDialog()
  }
  remoteModuleForm.code = remoteCoreTemplate.value
}

const handleBuildRemoteScaffold = async () => {
  if (!remoteCoreState.scriptId) return

  const res = await getRemoteModuleScaffold(remoteCoreState.scriptId)
  if (res.code !== 200) return

  const payload = res.data || {}
  openRemoteModuleDialog()
  remoteModuleForm.version = payload.moduleVersion || remoteModuleForm.version
  remoteModuleForm.moduleName = payload.moduleName || remoteModuleForm.moduleName
  remoteModuleForm.description = payload.description || remoteModuleForm.description
  remoteModuleForm.entryName = 'bootstrap'
  remoteModuleForm.code = payload.content || remoteModuleForm.code
  remoteScaffoldAnalysis.value = payload.analysis || null

  fillRemoteManifestFromScaffold(payload, { status: 'draft' })

  ElMessage.success('已根据当前上传版本生成远程模块草稿')
}

const handleSaveRemoteModule = async () => {
  if (!remoteCoreState.scriptId || !remoteModuleForm.version.trim() || !remoteModuleForm.code.trim()) {
    ElMessage.warning('请先填写模块版本和代码')
    return
  }

  savingRemoteModule.value = true
  try {
    const res = await saveRemoteModule(remoteCoreState.scriptId, { ...remoteModuleForm })
    if (res.code === 200) {
      ElMessage.success('远程模块已保存')
      remoteModuleDialogVisible.value = false
      loadRemoteCoreData()
    }
  } finally {
    savingRemoteModule.value = false
  }
}

const handlePublishRemoteModule = async (row) => {
  const res = await publishRemoteModule(row.id)
  if (res.code === 200) {
    ElMessage.success('远程模块已发布')
    loadRemoteCoreData()
  }
}

const handleUnpublishRemoteModule = async (row) => {
  const res = await unpublishRemoteModule(row.id)
  if (res.code === 200) {
    ElMessage.success('远程模块已转为草稿')
    loadRemoteCoreData()
  }
}

const loadRequests = async () => {
  loadingRequests.value = true
  try {
    const res = await getAuthRequests({ status: requestStatus.value || undefined, scriptId: requestFilters.scriptId || undefined })
    if (res.code === 200) {
      requests.value = res.data
    }
  } finally {
    loadingRequests.value = false
  }
}

const loadAuthorizations = async () => {
  loadingAuthorizations.value = true
  try {
    const res = await getAuthorizations({
      scriptId: authorizationFilters.scriptId || undefined,
      status: authorizationFilters.status || undefined,
      keyword: authorizationFilters.keyword || undefined
    })
    if (res.code === 200) {
      authorizations.value = res.data
    }
  } finally {
    loadingAuthorizations.value = false
  }
}

const loadDevices = async () => {
  loadingDevices.value = true
  try {
    const res = await getAuthorizationDevices({
      status: deviceFilters.status || undefined,
      keyword: deviceFilters.keyword || undefined
    })
    if (res.code === 200) {
      devices.value = res.data
    }
  } finally {
    loadingDevices.value = false
  }
}

const loadSessions = async () => {
  loadingSessions.value = true
  try {
    const res = await getRuntimeSessions({
      status: sessionFilters.status || undefined,
      keyword: sessionFilters.keyword || undefined
    })
    if (res.code === 200) {
      sessions.value = res.data
    }
  } finally {
    loadingSessions.value = false
  }
}

const loadEvents = async () => {
  loadingEvents.value = true
  try {
    const res = await getRuntimeEvents({
      eventType: eventFilters.eventType || undefined,
      keyword: eventFilters.keyword || undefined
    })
    if (res.code === 200) {
      events.value = res.data
    }
  } finally {
    loadingEvents.value = false
  }
}

const openDetail = (type, row) => {
  detailTitle.value = ({
    request: '申请详情',
    authorization: '授权详情',
    device: '设备详情',
    session: '会话详情',
    event: '事件详情'
  })[type] || '详情'
  detailData.value = row
  detailVisible.value = true
}

const openApproveDialog = (row) => {
  currentRequest.value = row
  approveForm.authorizationCode = ''
  approveForm.deviceLimit = 1
  approveForm.allowRebind = true
  approveForm.expiresAt = ''
  approveForm.reviewNote = ''
  approveDialogVisible.value = true
}

const handleApprove = async () => {
  if (!currentRequest.value) return
  approving.value = true
  try {
    const res = await approveAuthRequest(currentRequest.value.id, { ...approveForm })
    if (res.code === 200) {
      ElMessage.success('已审批通过并生成授权码')
      approveDialogVisible.value = false
      await Promise.all([loadRequests(), loadAuthorizations()])
    }
  } finally {
    approving.value = false
  }
}

const handleReject = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入拒绝原因', '拒绝申请', { inputPlaceholder: '可留空' })
    const res = await rejectAuthRequest(row.id, { reviewNote: value || '' })
    if (res.code === 200) {
      ElMessage.success('已拒绝该申请')
      loadRequests()
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const resetAuthorizationForm = () => {
  authorizationForm.scriptId = null
  authorizationForm.applicantName = ''
  authorizationForm.contact = ''
  authorizationForm.authorizationCode = ''
  authorizationForm.deviceLimit = 1
  authorizationForm.status = 'approved'
  authorizationForm.allowRebind = true
  authorizationForm.expiresAt = ''
  authorizationForm.remark = ''
}

const openAuthorizationDialog = (row = null) => {
  editingAuthorization.value = row
  resetAuthorizationForm()
  if (row) {
    authorizationForm.scriptId = row.script_id
    authorizationForm.applicantName = row.applicant_name
    authorizationForm.contact = row.contact
    authorizationForm.deviceLimit = row.device_limit || 1
    authorizationForm.status = row.status
    authorizationForm.allowRebind = !!row.allow_rebind
    authorizationForm.expiresAt = row.expires_at || ''
    authorizationForm.remark = row.remark || ''
  }
  authorizationDialogVisible.value = true
}

const handleSaveAuthorization = async () => {
  if (!authorizationForm.scriptId || !authorizationForm.applicantName.trim()) {
    ElMessage.warning('请先填写脚本和使用人')
    return
  }
  savingAuthorization.value = true
  try {
    const payload = { ...authorizationForm }
    const res = editingAuthorization.value
      ? await updateAuthorization(editingAuthorization.value.id, payload)
      : await createAuthorization(payload)
    if (res.code === 200) {
      ElMessage.success(editingAuthorization.value ? '授权已更新' : '授权已创建')
      authorizationDialogVisible.value = false
      loadAuthorizations()
    }
  } finally {
    savingAuthorization.value = false
  }
}

const handleDeactivateDevice = async (row) => {
  try {
    await ElMessageBox.confirm(`确定解绑设备「${row.device_label || row.id}」吗？`, '提示', { type: 'warning' })
    const res = await deactivateAuthorizationDevice(row.id)
    if (res.code === 200) {
      ElMessage.success('设备绑定已解除')
      await Promise.all([loadDevices(), loadAuthorizations()])
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const handleDeactivateAuthorization = async (row) => {
  try {
    await ElMessageBox.confirm(`确定停用授权码「${row.authorization_code}」吗？`, '提示', { type: 'warning' })
    const res = await deactivateAuthorization(row.id)
    if (res.code === 200) {
      ElMessage.success('授权已停用')
      await Promise.all([loadAuthorizations(), loadSessions()])
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const handleActivateAuthorization = async (row) => {
  const res = await activateAuthorization(row.id)
  if (res.code === 200) {
    ElMessage.success('授权已启用')
    loadAuthorizations()
  }
}

const handleResetDevices = async (row) => {
  try {
    await ElMessageBox.confirm(`确定清除授权码「${row.authorization_code}」的设备绑定吗？清除后，该授权当前在线的会话也会结束，用户下次运行时需要重新绑定。`, '提示', { type: 'warning' })
    const res = await resetAuthorizationDevices(row.id)
    if (res.code === 200) {
      ElMessage.success('设备绑定已清除')
      await Promise.all([loadAuthorizations(), loadDevices(), loadSessions()])
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const handleDeleteAuthorization = async (row) => {
  try {
    await ElMessageBox.confirm(`确定彻底删除授权码「${row.authorization_code}」吗？这会同时删除它的绑定设备、在线会话和运行记录。更适合清理测试数据，不建议用于正式用户。`, '高风险操作', { type: 'warning', confirmButtonText: '确认删除' })
    const res = await deleteAuthorization(row.id)
    if (res.code === 200) {
      ElMessage.success('授权记录已删除')
      await Promise.all([loadAuthorizations(), loadDevices(), loadSessions(), loadEvents(), loadRequests()])
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(error)
    }
  }
}

const handleCopyCode = async (code) => {
  if (!code) {
    ElMessage.warning('授权码为空')
    return
  }

  try {
    await navigator.clipboard.writeText(code)
    ElMessage.success('授权码已复制')
  } catch (error) {
    ElMessage.error('复制失败，请手动复制')
  }
}

const formatDuration = (seconds) => {
  const value = Number(seconds || 0)
  if (value < 60) return `${value}s`
  if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`
  return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`
}

const formatDetailValue = (label, value) => {
  if (label === 'event_type') return eventTypeText(value)
  if (label === 'status') return authorizationStatusText(value) || requestStatusText(value) || sessionStatusText(value)
  if (label === 'allow_rebind') return value ? '允许' : '不允许'
  return value
}

const formatEventPayload = (payload, eventType) => {
  if (!payload || typeof payload !== 'object') return '-'
  const keyMap = {
    runtimeVersion: '运行时版本',
    version: '脚本版本',
    activated: '已激活',
    message: '提示',
    applicantName: '申请人',
    deviceLabel: '设备',
    moduleVersion: '模块版本'
  }
  const prefix = eventTypeText(eventType)
  const text = Object.entries(payload).slice(0, 3).map(([key, value]) => `${keyMap[key] || key}: ${value}`).join(' | ') || '-'
  return prefix ? `${prefix} | ${text}` : text
}

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  await reloadAllData()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
})
</script>

<style scoped lang="scss">
.runtime-page {
  display: flex;
  flex-direction: column;
  gap: 20px;

  .hero-card {
    border: none;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  }

  .hero-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20px;
    margin-bottom: 18px;

    h2 {
      margin: 6px 0 10px;
      font-size: 30px;
      line-height: 1.2;
      color: var(--text-color-strong);
    }

    p {
      margin: 0;
      max-width: 760px;
      color: var(--text-color-soft);
      line-height: 1.7;
    }
  }

  .hero-kicker {
    color: #2f6fed;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .runtime-tabs :deep(.el-tabs__header) {
    margin-bottom: 4px;
  }

  .runtime-tabs :deep(.el-tabs__nav-wrap::after) {
    display: none;
  }

  .runtime-tabs :deep(.el-tabs__item) {
    height: 42px;
    padding: 0 18px;
    font-weight: 600;
  }

  .card-block {
    margin-bottom: 0;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .toolbar-right {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .table-actions-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .compact-actions {
    gap: 6px;
  }

  .inline-actions {
    flex-wrap: nowrap;
  }

  .small-gap {
    gap: 6px;
  }

  .header-tip {
    margin: 4px 0 0;
    color: var(--text-color-soft);
    font-size: 13px;
    line-height: 1.6;
  }

  .card-header.compact {
    align-items: flex-start;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .summary-card {
    padding: 14px 16px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.08), rgba(103, 194, 58, 0.08));
    border: 1px solid rgba(64, 158, 255, 0.12);

    .summary-label {
      display: block;
      color: var(--text-color-secondary);
      font-size: 13px;
      margin-bottom: 8px;
    }

    strong {
      font-size: 26px;
      line-height: 1;
      color: var(--text-color);
    }

    small {
      display: block;
      margin-top: 8px;
      color: var(--text-color-muted);
    }
  }

  .summary-card.warning {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(251, 191, 36, 0.08));
    border-color: rgba(245, 158, 11, 0.15);
  }

  .summary-card.success {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(52, 211, 153, 0.06));
    border-color: rgba(16, 185, 129, 0.15);
  }

  .summary-card.primary {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(96, 165, 250, 0.06));
    border-color: rgba(59, 130, 246, 0.15);
  }

  .summary-card.info {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(125, 211, 252, 0.06));
    border-color: rgba(14, 165, 233, 0.15);
  }

  .script-picker {
    width: 240px;
  }

  .remote-overview {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .quickstart-card {
    margin-bottom: 16px;
    padding: 18px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(14, 165, 233, 0.08));
    border: 1px solid rgba(37, 99, 235, 0.12);
  }

  .quickstart-head {
    margin-bottom: 14px;

    strong {
      display: block;
      color: var(--text-color-heading);
      font-size: 16px;
      margin-bottom: 6px;
    }

    p {
      margin: 0;
      color: var(--text-color-secondary);
      line-height: 1.7;
    }
  }

  .quickstart-steps {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .quickstart-step {
    padding: 14px;
    border-radius: 12px;
    background: var(--surface-elevated);
    border: 1px solid rgba(37, 99, 235, 0.1);

    span,
    strong,
    small {
      display: block;
    }

    span {
      width: 28px;
      height: 28px;
      line-height: 28px;
      text-align: center;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      font-weight: 700;
      margin-bottom: 10px;
    }

    strong {
      color: var(--text-color-heading);
      line-height: 1.5;
      margin-bottom: 6px;
    }

    small {
      color: var(--text-color-soft);
      line-height: 1.6;
    }
  }

  .overview-chip {
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-border-muted);

    span {
      display: block;
      color: var(--text-color-soft);
      font-size: 12px;
      margin-bottom: 8px;
    }

    strong {
      color: var(--text-color-strong);
      font-size: 18px;
      line-height: 1.4;
      word-break: break-word;
    }
  }

  .remote-side-column {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .manifest-card {
    margin-bottom: 20px;
  }

  .remote-mode-card {
    margin-bottom: 16px;
  }

  .mode-choice-head,
  .simple-protect-panel {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .mode-choice-head {
    margin-bottom: 14px;

    strong {
      display: block;
      color: var(--text-color-heading);
      font-size: 16px;
      margin-bottom: 6px;
    }

    p {
      margin: 0;
      color: var(--text-color-secondary);
      line-height: 1.7;
    }
  }

  .mode-choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    margin-bottom: 14px;

    :deep(.el-radio-button) {
      width: 100%;
    }

    :deep(.el-radio-button__inner) {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      border: 1px solid var(--surface-border-soft);
      text-align: left;
      white-space: normal;
      padding: 14px 16px;
      background: var(--surface-elevated);
    }

    :deep(.el-radio-button.is-active .el-radio-button__inner) {
      border-color: #2563eb;
      background: rgba(37, 99, 235, 0.08);
      color: var(--text-color);
      box-shadow: none;
    }
  }

  .mode-choice-item {
    strong,
    span {
      display: block;
    }

    strong {
      margin-bottom: 6px;
      color: var(--text-color-heading);
      font-size: 15px;
    }

    span {
      color: var(--text-color-secondary);
      line-height: 1.6;
      font-weight: 400;
    }
  }

  .simple-protect-panel {
    padding: 16px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.08));
    border: 1px solid rgba(16, 185, 129, 0.16);

    strong {
      display: block;
      color: var(--text-color-heading);
      margin-bottom: 6px;
    }

    p {
      margin: 0;
      color: var(--text-color-secondary);
      line-height: 1.7;
    }
  }

  .simple-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-end;
    flex: 0 0 auto;
  }

  .advanced-collapse {
    margin-bottom: 16px;

    :deep(.el-collapse-item__header) {
      padding: 0 4px;
      color: var(--text-color-secondary);
      font-weight: 600;
    }
  }

  .manifest-form :deep(.el-textarea__inner) {
    font-family: Consolas, Monaco, monospace;
  }

  .inner-card {
    border: 1px solid var(--surface-border-soft);
  }

  .remote-help {
    margin-top: 12px;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface-subtle);
    border: 1px solid var(--surface-border-soft);
    color: var(--text-color-secondary);

    strong {
      display: block;
      color: var(--text-color);
      margin-bottom: 6px;
    }

    p {
      margin: 0;
    }
  }

  .runtime-alert {
    margin-bottom: 16px;
  }

  .scaffold-analysis-card {
    margin-bottom: 16px;
  }

  .analysis-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .analysis-chip {
    padding: 12px 14px;
    border-radius: 12px;
    background: var(--surface-muted);
    border: 1px solid var(--surface-border-muted);

    span {
      display: block;
      color: var(--text-color-soft);
      font-size: 12px;
      margin-bottom: 6px;
    }

    strong {
      display: block;
      color: var(--text-color-strong);
      font-size: 16px;
      line-height: 1.4;
    }
  }

  .analysis-block {
    margin-bottom: 14px;

    strong {
      display: block;
      margin-bottom: 8px;
      color: var(--text-color-heading);
    }
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .analysis-text {
    margin: 0;
    color: var(--text-color-secondary);
    line-height: 1.6;
  }

  .analysis-list {
    margin: 0;
    padding-left: 18px;
    color: var(--text-color-secondary);
    line-height: 1.6;
  }

  .analysis-list.compact {
    margin-top: 0;
  }

  .analysis-alert {
    margin-top: 8px;
  }

  .detail-pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: Consolas, monospace;
  }

  :deep(.el-descriptions__label.el-descriptions__cell) {
    width: 180px;
    white-space: nowrap;
  }

  .runtime-stack-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .runtime-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  @media (max-width: 1200px) {
    .remote-overview,
    .summary-cards,
    .runtime-stack-grid,
    .runtime-grid,
    .quickstart-steps {
      grid-template-columns: 1fr;
    }

    .hero-head {
      flex-direction: column;
    }
  }

  @media (max-width: 768px) {
    .hero-head,
    .card-header,
    .toolbar-right,
    .mode-choice-head,
    .simple-protect-panel {
      flex-direction: column;
      align-items: stretch;
    }

    .hero-head h2 {
      font-size: 24px;
    }

    .script-picker {
      width: 100%;
    }

    .runtime-tabs :deep(.el-tabs__nav-wrap) {
      overflow-x: auto;
    }

    .runtime-tabs :deep(.el-tabs__nav) {
      gap: 6px;
    }

    .runtime-tabs :deep(.el-tabs__item) {
      padding: 0 14px;
      white-space: nowrap;
    }

    :deep(.el-form-item__content) {
      min-width: 0;
    }

    .analysis-summary {
      grid-template-columns: 1fr;
    }

    .mode-choice-grid {
      grid-template-columns: 1fr;
    }

    .simple-actions {
      justify-content: stretch;

      .el-button {
        width: 100%;
        margin-left: 0;
      }
    }

    .tag-row {
      gap: 6px;
    }
  }
}
</style>






