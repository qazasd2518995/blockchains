const AUDIT_ACTION_LABELS: Record<string, string> = {
  'register.blocked': '注册拦截',

  'agent.create': '新增代理',
  'agent.update': '更新代理资料',
  'agent.rebate.update': '调整代理退水',
  'agent.status.update': '调整代理状态',
  'agent.betting_limit.update': '调整代理限红',
  'agent.password.reset': '重设代理密码',

  'member.create': '新增会员',
  'member.notes.update': '更新会员备注',
  'member.status.active': '会员状态改为启用',
  'member.status.frozen': '会员状态改为冻结',
  'member.status.disabled': '会员状态改为停用',
  'member.delete': '删除会员',
  'member.balance.adjust': '调整会员余额',
  'member.password.reset': '重设会员密码',
  'member.betting_limit.update': '调整会员限红',

  'subaccount.create': '新增子账号',
  'subaccount.status.update': '调整子账号状态',
  'subaccount.password.reset': '重设子账号密码',
  'subaccount.delete': '删除子账号',

  'transfer.agent_to_agent': '代理点数转移',
  'transfer.agent_to_member': '代理转入会员',
  'transfer.member_to_agent': '会员退回代理',
  'transfer.cs_agent': '客服调整代理点数',
  'transfer.cs_member': '客服调整会员点数',

  'control.win_loss.create': '新增输赢控制',
  'control.win_loss.toggle': '切换输赢控制',
  'control.win_loss.delete': '删除输赢控制',
  'control.win_cap.upsert': '设置会员赢额封顶',
  'control.win_cap.toggle': '切换会员赢额封顶',
  'control.win_cap.delete': '删除会员赢额封顶',
  'control.deposit.create': '新增入金控制',
  'control.deposit.toggle': '切换入金控制',
  'control.deposit.delete': '删除入金控制',
  'control.agent_line.create': '新增代理线封顶',
  'control.agent_line.upsert': '设置代理线封顶',
  'control.agent_line.toggle': '切换代理线封顶',
  'control.agent_line.delete': '删除代理线封顶',
  'control.burst.create': '新增爆分控制',
  'control.burst.update': '更新爆分控制',
  'control.burst.toggle': '切换爆分控制',
  'control.burst.delete': '删除爆分控制',

  'announcement.create': '新增公告',
  'announcement.update': '更新公告',
  'announcement.toggle': '切换公告状态',
  'announcement.delete': '删除公告',
};

const AUDIT_TARGET_LABELS: Record<string, string> = {
  agent: '代理',
  member: '会员',
  subaccount: '子账号',
  transfer: '点数记录',
  announcement: '公告',
  win_loss_control: '输赢控制',
  win_cap_control: '赢额封顶',
  deposit_control: '入金控制',
  agent_line_control: '代理线封顶',
  burst_control: '爆分控制',
};

export function formatAuditAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export function formatAuditTarget(type: string | null | undefined): string {
  if (!type) return '—';
  return AUDIT_TARGET_LABELS[type] ?? '系统记录';
}
