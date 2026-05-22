# Genome Skill

[English](./README.md)

> Genome NFT 项目精华提炼为 AI 技能 —— 让你的 Agent 深度理解项目并直接参与链上拍卖。

**Ethereum** · **21,000 NFT 硬顶** · **21,000,000 GENE 硬顶** · **~20 分钟拍卖周期**

---

## 什么是 Genome？

Genome 是以太坊主网上的 NFT 项目，上限为 **21,000 枚 NFT**，内嵌名为 **GENE** 的代币（上限 21,000,000）。核心设计理念：NFT 与其代币是单一统一资产 —— 无法分离。转移 NFT 时，内部的 GENE 一并随行。

每枚 NFT 展示 **9 个腓尼基字母** —— 人类最古老的书写系统之一，希伯来文、阿拉伯文、希腊文的共同祖先。字母在铸造时随机分配并永久固定，构成每枚 NFT 独一无二的"基因序列"。艺术图案完全在链上生成，内嵌 GENE 越多，亮起的像素越多，图像越明亮。

---

## 经济模型

### 减半机制 —— 类比比特币

每枚 NFT 所含 GENE 数量每 2,100 枚（一个时代）减半：

| 时代 | NFT 编号 | 每枚 GENE | 累计供应量 |
|------|----------|-----------|------------|
| 0 | 1 – 2,100 | 5,000 | 10,500,000 |
| 1 | 2,101 – 4,200 | 2,500 | 15,750,000 |
| 2 | 4,201 – 6,300 | 1,250 | 18,375,000 |
| 3 | 6,301 – 8,400 | 625 | 19,687,500 |
| … | … | 递减减半 | … |
| 9 | 18,901 – 21,000 | ~9.8 | 21,000,000 |

早期 NFT 内嵌的 GENE 远多于后期。时代 0 的 NFT 密度最高。

### 拍卖收益分配

每次拍卖的获胜出价按如下比例分配：

- **0.5%** → 协议费
- **99.5%** → 社区国库

**时代 0：** 每 69 次铸造，国库自动将 ETH + GENE 配对注入 Uniswap V3 流动性 —— 引导 GENE 初始市场。

**时代 1+：** 每 3 次铸造，国库使用累积的 ETH 从公开市场回购 GENE。回购代币在国库中积累，供未来社区治理使用。

拍卖收益持续为 GENE 的市场流动性和价格底部提供支撑。

### 拍卖机制

- 每 **~20 分钟**（104 个以太坊区块）开启一轮新拍卖
- 最低出价：**0.0001 ETH**
- 固定截止时间 —— 新出价**不会**延长计时器
- 被超价后，ETH 立即返还
- **transfer** 函数限制每个钱包最多持有 **10 枚 NFT** —— 但通过拍卖获胜可突破此上限

---

## 链上地址

| 合约 | 地址 |
|------|------|
| Genome（NFT + GENE）| [`0x852740fad3e6f5cd4b234311172db29004cceea7`](https://etherscan.io/address/0x852740fad3e6f5cd4b234311172db29004cceea7) |
| 链 | 以太坊主网（chainId 1）|

---

## 知识库 —— Agent 能回答什么

本 Skill 内置知识库（`docs/genome-project.md`）。添加到你的 Agent 后，用自然语言提问即可，无需阅读合约。

### 项目基础

```
什么是 Genome？
总共会有多少枚 NFT？
GENE 和普通 ERC-20 有什么区别？
单个钱包可以无限持有 NFT 吗？
```

### 拍卖机制

```
Genome 拍卖是如何运作的？
被人超价后会怎样？
新出价会延长拍卖截止时间吗？
进入拍卖的最低出价是多少？
```

### 经济模型

```
解释减半时间表
拍卖所得的 ETH 去哪了？
社区国库是如何运作的？
GENE 市场流动性是怎么建立的？
回购机制什么时候启动？
```

### NFT 艺术

```
Genome NFT 上的字母代表什么？
为什么 NFT 图像会随时间变化？
艺术图案存储在链上吗？
哪个字母最稀有？
是什么让 NFT 更亮或更暗？
```

### 余额与转账

```
我的总 GENE 余额是如何计算的？
我可以在不转移 NFT 的情况下发送 GENE 吗？
把 NFT 发送到 DeFi 合约会怎样？
如果接收方已经持有 10 枚 NFT 怎么办？
```

---

## MCP 扩展 —— 竞价与交易工具

除了回答问题，本 Skill 还附带一个 **MCP 服务器**，让你的 Agent 能够进行链上操作：监控拍卖、出价、在最后几秒狙击、在 Uniswap 交换 GENE，以及管理竞价钱包。

### 可用工具

| 工具 | 功能 |
|------|------|
| `get_bid_status` | 实时拍卖快照：最高出价、剩余区块、当前获胜者 |
| `place_bid` | 以指定 ETH 金额提交单次出价 |
| `start_bid` | 统一 Watcher：无竞争时以最低价进入，有竞争者时以激进 gas 狙击 |
| `stop_bid` | 停止当前竞价 Watcher |
| `get_bid_watcher_status` | 查看 Watcher 状态、传输模式、触发进度、最近决策 |
| `get_bid_events` | 拉取所有未读竞价事件（已出价、超出上限、错误） |
| `get_bid_history` | 本地记录的近期出价历史 |
| `get_wallet_info` | ETH 余额、GENE 余额、默认设置 |
| `get_floor_price` | 根据内嵌 GENE 价值估算盈亏平衡出价 |
| `analyze_auction_history` | 近期拍卖轮次的逐轮统计与排行榜 |
| `analyze_bidder` | 分析竞争对手的出价行为与时机模式 |
| `swap_gene` | 在 Uniswap V3 买卖 GENE（ETH ↔ GENE） |
| `withdraw_eth` | 从竞价钱包向任意地址发送 ETH |
| `withdraw_gene` | 从竞价钱包发送 GENE 代币 |

### 示例 Agent 指令

```
当前 Genome 拍卖状态是什么？
监控拍卖并出价，上限 0.3 ETH —— 无人出价时以最低价进入，有竞争时狙击
分析最近 10 轮拍卖，展示狙击窗口 gas 统计
分析这个竞价者：0xABC...
用 0.1 ETH 在 Uniswap 购买 GENE
估算当前 Genome 底价
```

### 安装 MCP 服务器

#### 让 Agent 来安装

复制以下提示词发送给你的 AI Agent，它会处理全部安装流程：

```
Please install the Genome Skill and its MCP server from https://github.com/insevm/Genome-MCP-Server

Steps to follow:
1. Clone the repo into a suitable local directory, then run: npm install && npm run build
2. Ask me for: an Ethereum mainnet HTTP RPC URL (required, e.g. from Alchemy or Infura) and an optional WebSocket RPC URL (leave blank to skip)
3. Ask me to set an encryption password for the wallet key (I need to remember this — it is required every time the MCP server starts)
4. Run: node dist/index.js setup — enter the RPC URL, WebSocket URL, and password when prompted; record the wallet address it prints
5. Immediately back up the key file: copy ~/.genome-bid/session.key to a safe location (e.g. cloud storage or an external drive). This encrypted file is the only copy of the wallet key — if it is lost, any ETH inside becomes permanently inaccessible.
6. Register the MCP server in my agent config with GENOME_RPC_HTTP_URL, GENOME_RPC_WS_URL (optional), and GENOME_BID_PASSWORD in the env block
7. Tell me the wallet address so I can send ETH to fund bidding
8. Restart the agent to load the new config

Important — never run `node dist/index.js setup` again after the initial setup. The server will block it to protect the existing key, but running it could overwrite everything if protections are bypassed. If you ever genuinely need to replace the wallet, use `node dist/index.js renew` instead — it requires manual confirmation and cannot be run non-interactively.
```

#### 手动安装

**前提条件：** Node.js 20+，以太坊主网 RPC（HTTP 必须，WebSocket 可选但推荐以提升狙击精度）

```bash
git clone https://github.com/insevm/Genome-MCP-Server.git
cd Genome-MCP-Server
npm install && npm run build
node dist/index.js setup
```

向导会询问 RPC URL、最高出价和加密密码，然后打印钱包地址和可直接粘贴的 Agent 配置片段。向钱包充入 ETH 并重启 Agent 即可。

#### 升级

拉取最新版本并重新构建：

```bash
npm run update
```

然后重启 Agent 以加载新版本。

完整细节与安全模型 → 参见 [DEVELOPMENT.md](./DEVELOPMENT.md)

---

## 安全性

钱包私钥永不离开你的机器。它使用从密码派生的密钥以 AES-GCM 加密存储。竞价钱包只充入你愿意用于竞价和交换的金额。

```
你的密码  →  加密私钥（~/.genome-bid/session.key）  →  MCP 服务器（本地）  →  以太坊
```

---

*基于 [Model Context Protocol](https://modelcontextprotocol.io) 构建。兼容 Claude Desktop、Cursor 及任何支持 MCP 的 Agent。*
