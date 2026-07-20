# 目录结构与分层架构

## Bounded Context 结构

每个 Bounded Context 是一个顶层 Python Package，内部包含四层：

```
{context_name}/
├── domain/                 # 领域层：纯业务逻辑，零技术依赖
├── application/            # 应用层：用例编排，事务协调
├── infrastructure/         # 基础设施层：技术实现
└── interface/              # 接口层：对外暴露的 API
```

## 各层详细结构

```
{context_name}/
├── domain/
│   ├── aggregate/
│   │   └── {aggregate_name}/
│   │       ├── {root_name}.py          # Aggregate Root
│   │       ├── {entity_name}.py        # 内部 Entity（可选）
│   │       ├── {value_object}.py       # Value Object（可选）
│   │       └── {root_name}_factory.py  # Factory（可选，创建逻辑超过20行时抽出）
│   ├── event/
│   │   └── {event_name}.py            # Domain Event
│   ├── repository/
│   │   └── {root_name}_repo.py        # Repository 接口（Protocol）
│   ├── gateway/
│   │   └── {gateway_name}.py          # 外部能力接口（Protocol）
│   └── service/
│       └── {service_name}.py          # Domain Service
│
├── application/
│   ├── command/
│   │   └── {use_case_name}.py         # Command Handler（写操作用例）
│   ├── query/
│   │   └── {query_name}.py            # Query Handler（读操作用例）
│   ├── event_handler/
│   │   └── on_{event_name}.py         # 本 Context 内的事件处理器
│   ├── port/
│   │   └── {port_name}.py             # 应用层定义的外部能力接口
│   └── dto/
│       └── {dto_name}.py              # 应用层数据传输对象
│
├── infrastructure/
│   ├── persistence/
│   │   └── {root_name}_repo_{impl}.py # Repository 实现
│   ├── messaging/
│   │   ├── event_publisher.py         # 事件发布实现
│   │   ├── event_subscriber.py        # 事件订阅实现
│   │   ├── outbox.py                  # Outbox 表模型
│   │   ├── outbox_relay.py            # Outbox 投递进程
│   │   └── idempotent_handler.py      # 幂等消费包装器
│   ├── acl/
│   │   └── {external}_acl.py          # 防腐层
│   └── gateway/
│       └── {gateway_name}_impl.py     # 外部能力实现
│
└── interface/
    ├── {context_name}_api.py           # 内部 API 路由
    └── open_host/
        ├── {service_name}_api.py       # Open Host Service
        └── schema/
            └── {event/dto}_schema.py   # Published Language
```

## 单 Context 简化结构

项目只有一个 Bounded Context 时，省略顶层 Context 目录：

```
src/
├── domain/
├── application/
├── infrastructure/
└── interface/
```

## 概念与目录的映射关系

| DDD 概念 | 目录体现 | 说明 |
|----------|---------|------|
| Bounded Context | 顶层目录 `order/` `inventory/` | 各自独立分层，Context 间只通过事件或 API 通信 |
| Aggregate | `aggregate/{name}/` 整个目录 | 一个事务边界，内部对象一起加载、一起持久化 |
| Aggregate Root | 目录里的主文件 `{name}.py` | 外部只持有 Root 的引用 |
| Factory | `aggregate/{name}/{name}_factory.py` | 跟着 Aggregate 走 |
| 依赖倒置 | 接口在 `domain/`，实现在 `infrastructure/` | 依赖方向永远向内 |
| ACL（防腐层） | `infrastructure/acl/` | 翻译外部模型，保护领域层 |
| Open Host Service | `interface/open_host/` | 对外暴露标准化接口 |
| Published Language | `interface/open_host/schema/` | 接口使用的公共契约 |
