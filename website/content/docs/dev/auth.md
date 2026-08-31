---
title: 登录与会话
description: 扫码 / 手机号登录、凭证存储、多账号切换与会话状态。
order: 12
---

# 登录与会话

> 理解登录态如何建立与保持：登录方式、凭证持久化、多账号切换、会话状态 hook。

## 本页边界

覆盖：`src/lib/netease/auth.ts`、`auth-phone.ts`、`auth-cookie.ts`、`account-vault.ts`、`native/device-cookie.ts`、`src/hooks/use-netease-session.tsx`。

**不**覆盖：API 请求入口（见 [API](#/docs/dev/api)）、快捷键与托盘（见 [快捷键](#/docs/dev/hotkeys)）。

## 登录方式

| 方式 | 入口 | 说明 |
|---|---|---|
| 扫码 | `auth.ts`：`createQrSession`、`fetchQrKey`、`pollQrLogin`、`checkQrLogin` | 二维码轮询，推荐 |
| 手机号 | `auth-phone.ts`：`sendCaptcha(phone, ctcode?)`、`loginWithCellphone({ ... })` | 验证码 / 密码 |

```ts
import { createQrSession, pollQrLogin } from "@/lib/netease/auth"

const session = await createQrSession()          // { key, qrimg, qrurl }
// 渲染 qrTextToDataUrl(session.qrurl) 后轮询
const code = await pollQrLogin(session.key)
// 803 成功；800 过期 / 801 待扫 / 802 已扫待确认
if (code === 803) {
    // 登录成功：cookie 已写入，账号进 vault
}
```

```ts
import { sendCaptcha, loginWithCellphone } from "@/lib/netease/auth-phone"

await sendCaptcha("13800138000")
await loginWithCellphone({ phone: "13800138000", captcha: "123456" })
```

## 凭证存储

| 模块 | 职责 |
|---|---|
| `auth-cookie.ts` | 会话 cookie 的读写：`setCookiesFromApi`、`isNeteaseLoggedIn`、`clearNeteaseSession` |
| `account-vault.ts` | 多账号库（localStorage `musicstorm-netease-accounts`）：`listNeteaseAccounts`、`switchNeteaseAccount`、`removeNeteaseAccount`、`upsertActiveAccount`、`reconcileNeteaseVaultOnBoot`、`deactivateNeteaseSession`、`getActiveUserId` |
| `native/device-cookie.ts` | 设备 ID 与游客 `MUSIC_A` 凭证：`getOrCreateDeviceId`、`ensureDeviceCookies`、`getStoredMusicA`、`storeMusicA` |

关键约束：**扫码登录的 deviceId 必须与后续 unikey/check 请求完全一致**，否则 App 提示「登录有风险」。设备凭证统一走 `device-cookie.ts`，不要自行生成。

## 会话状态

`use-netease-session`（`src/hooks/use-netease-session.tsx`）提供 `NeteaseSessionProvider` + `useNeteaseSession()`：

```ts
const { ready, loggedIn, profile, accounts, activeUserId } = useNeteaseSession()
```

| 字段 | 说明 |
|---|---|
| `ready` | 启动时 vault 对账是否完成 |
| `loggedIn` | 当前是否已登录（cookie 有效） |
| `profile` | `NeteaseProfile`（fetchUserAccount） |
| `accounts` | 账号库列表 |
| `activeUserId` | 当前账号 uid |

启动时 `reconcileNeteaseVaultOnBoot` 对账账号库；页面在 `ready` 前不要做依赖登录态的请求。

## 每日自动签到

签到逻辑收敛在 `src/lib/netease/daily-signin.ts`，调度在 `src/hooks/use-auto-signin.ts`，设置页开关在账号 Tab：

| 模块 | 职责 |
|---|---|
| `daily-signin.ts` | `performDailySignin(userId)`：先 `dailySummary` 查 `pcSign` / `mobileSign` 状态，只补签缺失渠道；全渠道已签时记为已完成、不发签到请求 |
| `use-auto-signin.ts` | 登录态就绪后立即检查一次；常驻期间每分钟检查，覆盖零点仍在应用内的跨天场景 |
| 账号 Tab（`account-tab.tsx`） | 「自动签到」开关（`readAutoSigninEnabled` / `setAutoSigninEnabled`）与手动签到按钮（`notifyPromise` 状态 toast） |

去重与幂等约定：

- 结果按**自然日**（本地时区 `YYYY-MM-DD`）记入 localStorage `musicstorm-signin-log`，同日重复调用直接短路，不发任何请求
- `signinInFlight` 单飞闸：进行中的签到共享同一 Promise，不并发重入
- 记录变更广播 `musicstorm-signin-log`（不带冒号），账号页监听刷新
- 开关存 `musicstorm-auto-signin`，默认开启；关闭后 `maybeAutoSignin` 直接 return

## 常见问题

| 现象 | 原因与处理 |
|---|---|
| 「登录有风险」提示 | deviceId 前后不一致；确认走 `getOrCreateDeviceId` 统一获取 |
| 登录成功但请求仍 301/未登录 | 确认请求走 `neteaseRequest`（自动带 cookie），且未清掉 cookie |
| 切账号后数据串 | 切号后应等待 `ready` 刷新，重新拉取账号相关数据 |
| 二维码一直 801 | 网络未到 `interfacepc` 域（扫码接口专属域） |

## 排查路径

1. 确认扫码走 `createQrSession` → `pollQrLogin`（不要手动拼 unikey）
2. 确认 deviceId 来自 `device-cookie.ts` 且全程一致
3. 确认 `setCookiesFromApi` 在 803 时被调用
4. 看 `musicstorm-netease-accounts` 与 `musicstorm-netease-active-uid` 是否符合预期
5. 请求未登录：确认 cookie 被 `neteaseRequest` 携带
