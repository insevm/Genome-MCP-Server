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
| `place_bid` | 手动单次出价，以指定 ETH 金额提交 —— 无狙击器、无 Watcher |
| `start_sniper` | 启动自主狙击器：等待最后几个区块触发，以激进 gas 精准狙击；若无竞争者则以最低价进入 |
| `stop_sniper` | 停止当前狙击器 |
| `get_sniper_status` | 查看狙击器状态、传输模式、触发窗口倒计时、下次狙击出价预估 |
| `get_sniper_events` | 拉取所有未读狙击事件（已狙击、本轮跳过、错误） |
| `get_bid_history` | 本地记录的近期出价历史 |
| `get_wallet_info` | ETH 余额、GENE 余额、默认设置 |
| `get_floor_price` | 根据内嵌 GENE 价值估算盈亏平衡出价 |
| `analyze_auction_history` | 近期拍卖轮次的逐轮统计与排行榜 |
| `analyze_bidder` | 分析竞争对手的出价行为与时机模式 |
| `swap_gene` | 在 Uniswap V3 买卖 GENE（ETH ↔ GENE） |
| `withdraw_eth` | 从竞价钱包向任意地址发送 ETH |
| `withdraw_gene` | 从竞价钱包发送 GENE 代币 |

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

### 备份钱包私钥

加密私钥文件是竞价钱包的唯一副本。建议在完成初始化后立即执行此提示词，此后每次需要刷新备份时同样使用。

```
将 Genome 竞价钱包的私钥文件备份到我指定的文件夹。

步骤：
1. 询问我目标备份文件夹的路径。
2. 确认源私钥文件在 Genome 配置目录的标准位置存在。
   如果文件不存在，立即停止并报告错误。
3. 检查目标文件夹是否存在。如果不存在，立即停止并告知我，
   不要自行创建该文件夹。
4. 列出目标文件夹中当前已有的文件并展示给我。
5. 以包含当前日期和时间的格式命名备份文件
   （例如 session.key.2024-01-15T10-30-00），确保不与已有文件冲突。
6. 将私钥文件以该时间戳文件名复制到目标文件夹。
   严禁覆盖、重命名、移动或删除目标文件夹中任何已存在的文件。
7. 通过显示新文件的完整路径和文件大小来确认备份成功。
   不得显示文件内容。
```

### 示例 Agent 指令

```
当前 Genome 拍卖状态是什么？
启动狙击器，最高出价 0.3 ETH —— 有竞争时在最后一个区块狙击，无竞争时以最低价进入
分析最近 10 轮拍卖，展示狙击窗口 gas 统计
分析这个竞价者：0xABC...
用 0.1 ETH 在 Uniswap 购买 GENE
估算当前 Genome 底价
```

### 自动最低价竞价循环

使用以下 prompt，让 Agent 在每轮拍卖中以最低安全价格自动出价，且不会出超过 Uniswap 卖出价的冤枉钱：

```
每 20 分钟自动执行一次 Genome 拍卖竞价循环：
1. 调用 get_floor_price，获取当前 GENE 在 Uniswap 的可卖出价格（保本价）。
2. 调用 get_bid_status，获取当前拍卖所需的最低出价金额。
3. 若最低出价 ≤ Uniswap 底价：调用 place_bid，以最低有效金额出价，gas 策略选择 normal。
4. 若最低出价 > Uniswap 底价：跳过本轮 —— 当前 GENE 价格下出价无利可图。
5. 等待下一轮拍卖（约 20 分钟 / 104 个区块）后重复，无限循环。

规则：
- 只使用 place_bid，不使用 start_bid 或任何狙击模式。
- 每次出价的 gas 策略必须为 normal。
- 出价金额永远不超过 get_floor_price 返回的当前 Uniswap 底价。
```

### 启动狙击器

使用以下提示词配置并启动狙击器。Agent 会逐一询问每个参数后再执行启动。

```
我想启动 Genome 拍卖狙击器。在调用 start_sniper 之前，
请逐一询问我以下参数，每个参数需显示默认值并解释权衡取舍，
让我能做出知情决策：

1. maxEth（必填）
   — 每轮拍卖你愿意出的最高价格（ETH）。
   — 若该轮所需最低出价超过此值，本轮将被跳过。
   — 无默认值，请向我询问。

2. triggerBlocks（默认：1）
   — 距拍卖截止还有多少个区块时触发狙击。
   — 1 = 最后一个区块（暴露风险最低，出块时间风险最高）。
   — 数值越大，交易上链时间越充裕，但出价意图暴露得越早。

3. bidBuffer（默认：0）
   — 在最低所需出价基础上额外加价的比例。
   — 0 = 精确按最低出价；0.05 = 在最低出价上加 5%。
   — 适用于希望对同一区块内的竞争狙击留有缓冲的场景。

4. gasPriorityMultiplier（默认：5.0，范围 1–20）
   — 狙击交易的 maxPriorityFeePerGas 倍数。
   — 越高越容易在拥堵区块中成功上链，但 gas 消耗也越多。
   — 建议先调用 analyze_auction_history 查看历史狙击窗口的典型 gas 水平。

5. minPriorityFeeGwei（默认：不设置）
   — maxPriorityFeePerGas 的绝对最低值（gwei），优先级高于倍数计算结果。
   — 仅在 base fee 极低、倍数计算结果过小时才需要设置。
   — 留空则跳过。

6. usePrivateMempool（默认：false）
   — 若为 true，狙击交易通过 Flashbots Protect 而非公共内存池提交，
     可降低 MEV 抢跑风险。
   — 权衡：打包速度略慢，且依赖 Flashbots RPC 的可用性。

7. dryRun（默认：false）
   — 若为 true，狙击器模拟出价但不发送任何交易。
   — 建议在正式运行前用此模式验证配置。

待我确认所有参数后，使用这些参数调用 start_sniper，
并回报：狙击器状态、传输模式（WebSocket 或 HTTP 轮询）、
钱包地址，以及当前生效的配置。
```

### 定时拍卖状态播报（Hermes / 外部调度器）

如果你的 Agent 框架在独立进程上下文中执行定时任务（如 Hermes 例程），该上下文的 MCP 工具调用无法访问主会话中运行的狙击器。请改用以下提示词 —— 它会让 Agent 编写一个独立的 Shell 脚本，直接通过 RPC 读取链上数据，完全不依赖 MCP server 进程。

```
任务名称：Genome 拍卖状态播报
调度频率：每 1 分钟执行一次

─── 初始化（仅首次，脚本已存在则跳过）──────────────────────────────

1. 选择一个合适的本地路径存放报告脚本。路径应持久可写，建议放在
   你日常管理的本地脚本目录中。记录所选路径，后续每分钟都会用到。

2. 在该路径编写一个 Shell 脚本，脚本需满足以下要求：
   - 从 Genome MCP server 的已有配置文件中读取 RPC 端点和钱包地址，
     无需硬编码任何参数。
   - 直接通过 RPC 查询 Genome 拍卖合约的链上数据，
     不调用 MCP 工具，不依赖 MCP server 进程。
   - 检测狙击器 Watcher 是否正在运行（可检查 PID 文件、锁文件或
     MCP server 写入的状态文件，选择最可靠的判断方式）。
   - 将当前拍卖状态与上次运行的状态对比（通过本地临时文件在两次
     运行之间持久化状态）。
   - 向 stdout 输出一行 JSON，包含以下字段：
       changed, token, currentBlock, blocksRemaining, deadlineBlock,
       topBid, minBid, winner, isWinning, watcherStatus
   - 成功时以退出码 0 退出，失败时以非零退出码退出。

3. 赋予脚本可执行权限。

─── 循环执行（每分钟）──────────────────────────────────────────────

1. 运行报告脚本：
   bash <脚本路径>

2. 若脚本以非零退出码退出或无输出，播报：
   ⚠️ 报告脚本执行失败，请检查：<脚本路径>
   然后停止本次播报。

3. 解析 JSON 输出，按以下格式播报。

─── 播报格式 ────────────────────────────────────────────────────────

若 watcherStatus 显示狙击器未运行：
⚠️ 狙击器未运行
📊 Token #<token> | 剩余 <blocksRemaining> 块 | 最高出价 <topBid> ETH | 最低出价 <minBid> ETH | 领先: <是/否>

若 changed 为 true（或首次运行）：
<简短描述变化，例如"新一轮拍卖开始"、"被人超价"、"出现新领先者">
📊 Token #<token> | 剩余 <blocksRemaining> 块 | 最高出价 <topBid> ETH | 最低出价 <minBid> ETH | 领先: <是/否> | 狙击器: <watcherStatus>

若 changed 为 false：
📊 Token #<token> | 剩余 <blocksRemaining> 块 | 最高出价 <topBid> ETH | 最低出价 <minBid> ETH | 领先: <是/否> | 狙击器: <watcherStatus>

任何情况下均不得调用 MCP 工具，所有数据来自脚本输出。
```

---

## 安全性

钱包私钥永不离开你的机器。它使用从密码派生的密钥以 AES-GCM 加密存储。竞价钱包只充入你愿意用于竞价和交换的金额。

```
你的密码  →  加密私钥（~/.genome-bid/session.key）  →  MCP 服务器（本地）  →  以太坊
```

---

*基于 [Model Context Protocol](https://modelcontextprotocol.io) 构建。兼容 Claude Desktop、Cursor 及任何支持 MCP 的 Agent。*
