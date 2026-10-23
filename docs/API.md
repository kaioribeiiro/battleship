# Referência da API REST

- **Base URL (Produção):** `https://battleship-ogod.onrender.com/api`
- **Base URL (Local):** `http://localhost:3000/api`
- **Swagger UI Interativo:** [https://battleship-ogod.onrender.com/api/docs](https://battleship-ogod.onrender.com/api/docs)
- **Formato:** JSON (`Content-Type: application/json`)
- **Autenticação:** `Authorization: Bearer <jwt>` nos endpoints marcados com 🔒
- **Tratamento de Erros:** ver [Seção 7 — Formato de Erros](#7-erros)

> Eventos em tempo real (presença, convites, turnos, resultado) também são transmitidos via **Socket.IO**; consulte [SOCKET_EVENTS.md](./SOCKET_EVENTS.md).

---

## 1. Health Check

### `GET /health`
Verifica a disponibilidade e o tempo de atividade do servidor. Não requer autenticação.

**Resposta `200 OK`**
```json
{
  "status": "ok",
  "uptime": 42.18,
  "timestamp": "2026-10-23T19:00:00.000Z"
}
```

---

## 2. Autenticação

### `POST /auth/register`
Registra um novo operador. A senha é armazenada com hash `bcrypt`.

**Request Body**
```json
{
  "username": "capitao",
  "password": "segredo123"
}
```

**Resposta `201 Created`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "b7e6d8a0-1234-4abc-89ab-cdef01234567",
    "username": "capitao",
    "wins": 0,
    "losses": 0,
    "draws": 0,
    "isBot": false
  }
}
```

**Erros:** `400` payload inválido (`username` fora de 3–20 caracteres ou `password` < 6 caracteres) · `409` `username` já está em uso.

### `POST /auth/login`
Autentica um operador existente (busca *case-insensitive* por `username`) e retorna um token JWT.

**Request Body**
```json
{
  "username": "capitao",
  "password": "segredo123"
}
```

**Resposta `200 OK`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "b7e6d8a0-1234-4abc-89ab-cdef01234567",
    "username": "capitao",
    "wins": 3,
    "losses": 1,
    "draws": 1,
    "isBot": false
  }
}
```

**Erros:** `400` payload inválido · `401` credenciais inválidas.

### `POST /auth/guest`
Cria instantaneamente uma conta temporária de visitante (`Guest_XXXX`) e retorna o token JWT para avaliação rápida com 1 clique.

**Resposta `201 Created`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "e4f5a6b7-1234-4abc-89ab-cdef01234567",
    "username": "Guest_4821",
    "wins": 0,
    "losses": 0,
    "draws": 0,
    "isBot": false
  }
}
```

### `GET /auth/me` 🔒
Retorna os dados atualizados do operador autenticado.

**Resposta `200 OK`**
```json
{
  "id": "b7e6d8a0-1234-4abc-89ab-cdef01234567",
  "username": "capitao",
  "wins": 3,
  "losses": 1,
  "draws": 1,
  "isBot": false
}
```

### `POST /auth/logout` 🔒
Registra o encerramento da sessão na trilha de auditoria.

**Resposta `204 No Content`**

---

## 3. Usuários e Ranking

### `GET /users/online` 🔒
Lista todos os usuários conectados no momento via Socket.IO.

**Resposta `200 OK`**
```json
[
  { "id": "b7e6d8a0-1234-4abc-89ab-cdef01234567", "username": "capitao" },
  { "id": "a1b2c3d4-5678-4ef0-1234-567890abcdef", "username": "almirante" }
]
```

### `GET /users/:id` 🔒
Retorna o perfil público e estatísticas de um usuário específico.

**Resposta `200 OK`**
```json
{
  "id": "a1b2c3d4-5678-4ef0-1234-567890abcdef",
  "username": "almirante",
  "wins": 5,
  "losses": 2,
  "draws": 0
}
```

**Erros:** `404` usuário não encontrado.

### `GET /scoreboard`
Retorna o ranking público de jogadores humanos (`isBot: false`), ordenado por `wins DESC`, `draws DESC`, `losses ASC`, `username ASC`. Não requer autenticação.

**Query Params:** `limit` (opcional, default `20`, máx `100`).

**Resposta `200 OK`**
```json
[
  { "rank": 1, "userId": "a1b2c3d4-...", "username": "almirante", "wins": 5, "losses": 2, "draws": 0 },
  { "rank": 2, "userId": "b7e6d8a0-...", "username": "capitao", "wins": 3, "losses": 1, "draws": 1 }
]
```

---

## 4. Partidas

### `POST /games` 🔒
Cria uma nova partida multiplayer e envia um convite para um usuário atualmente online.

**Request Body**
```json
{
  "inviteeId": "a1b2c3d4-5678-4ef0-1234-567890abcdef"
}
```

**Resposta `201 Created`**
```json
{
  "game": {
    "id": "c9d8e7f6-...",
    "player1Id": "b7e6d8a0-...",
    "player2Id": null,
    "status": "WAITING",
    "result": null,
    "winnerId": null,
    "abandonedById": null,
    "totalTurns": 0,
    "startedAt": null,
    "endedAt": null
  },
  "invitation": {
    "id": "f1e2d3c4-...",
    "gameId": "c9d8e7f6-...",
    "inviterId": "b7e6d8a0-...",
    "inviteeId": "a1b2c3d4-...",
    "status": "PENDING",
    "expiresAt": "2026-10-23T19:05:00.000Z"
  }
}
```

**Erros:** `400` convidar a si mesmo ou `inviteeId` ausente · `403` convidado está offline (`USER_OFFLINE`) · `404` usuário não encontrado (`USER_NOT_FOUND`) · `409` já existe um convite pendente entre a dupla.

### `POST /games/vs-bot` 🔒
Cria uma partida single-player contra a CPU. O bot aceita o convite e posiciona sua frota automaticamente; a partida já retorna na fase `SETUP` aguardando apenas a frota do jogador humano.

**Request Body (opcional)**
```json
{
  "difficulty": "hard"
}
```
> Valores aceitos para `difficulty`: `"easy"` (Cadete), `"medium"` (Comandante) ou `"hard"` (Almirante — padrão).

**Resposta `201 Created`**
```json
{
  "gameId": "c9d8e7f6-...",
  "botId": "d0e1f2a3-...",
  "difficulty": "hard"
}
```

### `GET /games` 🔒
Lista o histórico de partidas das quais o usuário autenticado participa.

**Query Params:** `status` (opcional), `limit` (default `20`), `offset` (default `0`).

**Resposta `200 OK`**
```json
[
  {
    "id": "c9d8e7f6-...",
    "player1Id": "b7e6d8a0-...",
    "player2Id": "a1b2c3d4-...",
    "status": "FINISHED",
    "result": "WIN",
    "winnerId": "b7e6d8a0-...",
    "abandonedById": null,
    "totalTurns": 31,
    "startedAt": "2026-10-23T19:00:00.000Z",
    "endedAt": "2026-10-23T19:08:12.000Z",
    "opponent": { "id": "a1b2c3d4-...", "username": "almirante" }
  }
]
```

### `GET /games/:id` 🔒
Retorna a visão do estado da partida para o jogador autenticado. Enquanto a partida está em andamento (`SETUP` ou `IN_PROGRESS`), `opponent.ships` retorna vazio (`[]`) para preservar a neblina de guerra (*Fog of War*). Quando a partida termina (`FINISHED` ou `ABANDONED`), a frota inimiga é revelada.

**Resposta `200 OK`**
```json
{
  "game": {
    "id": "c9d8e7f6-...",
    "status": "IN_PROGRESS",
    "player1Id": "b7e6d8a0-...",
    "player2Id": "a1b2c3d4-...",
    "turnUserId": "b7e6d8a0-...",
    "totalTurns": 2,
    "result": null,
    "winnerId": null
  },
  "you": {
    "id": "b7e6d8a0-...",
    "ships": [
      {
        "type": "DESTROYER",
        "size": 2,
        "positions": [{ "x": 0, "y": 0 }, { "x": 1, "y": 0 }],
        "sunk": false
      }
    ],
    "shotsReceived": [
      { "x": 9, "y": 9, "result": "MISS", "sunkShip": null, "shooterId": "a1b2c3d4-...", "turnNumber": 2 }
    ],
    "shotsFired": [
      { "x": 4, "y": 7, "result": "HIT", "sunkShip": null, "shooterId": "b7e6d8a0-...", "turnNumber": 1 }
    ]
  },
  "opponent": {
    "id": "a1b2c3d4-...",
    "shotsReceived": [
      { "x": 4, "y": 7, "result": "HIT", "sunkShip": null, "shooterId": "b7e6d8a0-...", "turnNumber": 1 }
    ],
    "shotsFired": [
      { "x": 9, "y": 9, "result": "MISS", "sunkShip": null, "shooterId": "a1b2c3d4-...", "turnNumber": 2 }
    ],
    "ships": []
  }
}
```

**Erros:** `403` usuário não é participante (`NOT_PARTICIPANT`) · `404` partida não encontrada · `409` partida ainda aguarda aceite de convite (`WAITING`).

### `GET /games/:id/result` 🔒
Retorna o resumo do desfecho de uma partida já finalizada.

**Resposta `200 OK`**
```json
{
  "gameId": "c9d8e7f6-...",
  "status": "FINISHED",
  "result": "WIN",
  "winnerId": "b7e6d8a0-...",
  "loserId": "a1b2c3d4-...",
  "totalTurns": 31,
  "endedAt": "2026-10-23T19:08:12.000Z"
}
```

**Erros:** `403` não participante · `404` partida não encontrada · `409` partida ainda em andamento.

---

## 5. Convites

### `POST /invitations/:id/accept` 🔒
Aceita um convite pendente (restrito ao destinatário `inviteeId`). Move a partida para `SETUP`.

**Resposta `200 OK`**
```json
{
  "gameId": "c9d8e7f6-...",
  "status": "SETUP"
}
```

**Erros:** `403` convite não pertence ao usuário · `404` convite inexistente · `409` convite já respondido · `410` convite expirado (`INVITATION_EXPIRED`).

### `POST /invitations/:id/reject` 🔒
Recusa um convite pendente (restrito ao destinatário `inviteeId`). Cancela a partida associada (`ABANDONED`).

**Resposta `200 OK`**
```json
{
  "invitationId": "f1e2d3c4-...",
  "status": "REJECTED"
}
```

**Erros:** `403` convite não pertence ao usuário · `404` convite inexistente · `409` convite já respondido.

---

## 6. Posicionamento de Frota e Combate

### `POST /games/:id/fleet` 🔒
Registra o posicionamento das 5 embarcações do jogador na fase `SETUP`. Todas as embarcações devem estar dentro do grid 10×10, sem sobreposição e com posições contíguas alinhadas horizontal ou verticalmente. Quando ambos os jogadores confirmam suas frotas, a partida inicia (`IN_PROGRESS`).

**Request Body**
```json
{
  "ships": [
    { "type": "CARRIER",    "positions": [{"x":0,"y":0},{"x":1,"y":0},{"x":2,"y":0},{"x":3,"y":0},{"x":4,"y":0}] },
    { "type": "BATTLESHIP", "positions": [{"x":0,"y":1},{"x":1,"y":1},{"x":2,"y":1},{"x":3,"y":1}] },
    { "type": "CRUISER",    "positions": [{"x":0,"y":2},{"x":1,"y":2},{"x":2,"y":2}] },
    { "type": "SUBMARINE",  "positions": [{"x":0,"y":3},{"x":1,"y":3},{"x":2,"y":3}] },
    { "type": "DESTROYER",  "positions": [{"x":0,"y":4},{"x":1,"y":4}] }
  ]
}
```

**Resposta `200 OK` (aguardando o adversário)**
```json
{
  "gameId": "c9d8e7f6-...",
  "status": "SETUP",
  "waitingFor": "opponent",
  "turnUserId": null
}
```

**Resposta `200 OK` (ambos prontos — partida iniciada)**
```json
{
  "gameId": "c9d8e7f6-...",
  "status": "IN_PROGRESS",
  "turnUserId": "b7e6d8a0-..."
}
```

**Erros:** `400` frota inválida (quantidade, tamanho, sobreposição, fora do grid ou posições não contíguas) · `403` não participante · `409` fora da fase `SETUP` ou frota já enviada.

### `POST /games/:id/shots` 🔒
Efetua um disparo nas coordenadas `(x, y)` do tabuleiro adversário.

**Request Body**
```json
{
  "x": 4,
  "y": 7
}
```

**Resposta `200 OK`**
```json
{
  "shooterId": "b7e6d8a0-...",
  "targetUserId": "a1b2c3d4-...",
  "x": 4,
  "y": 7,
  "result": "HIT",
  "sunkShip": null,
  "turnNumber": 13,
  "turnUserId": "a1b2c3d4-...",
  "gameOver": false
}
```

**Erros:** `400` coordenadas fora de `0–9` (`INVALID_MOVE`) · `403` não participante (`NOT_PARTICIPANT`) · `409` não é o seu turno (`NOT_YOUR_TURN`), coordenada já atingida (`INVALID_MOVE`) ou partida não está em andamento (`GAME_ALREADY_OVER`).

### `POST /games/:id/abandon` 🔒
Abandona a partida em andamento, concedendo vitória imediata ao oponente.

**Resposta `200 OK`**
```json
{
  "gameId": "c9d8e7f6-...",
  "status": "ABANDONED",
  "winnerId": "a1b2c3d4-..."
}
```

**Erros:** `403` não participante · `409` partida já encerrada.

---

## 7. Erros

Todas as respostas de erro seguem o envelope JSON padronizado pelo middleware `errorHandler`:

```json
{
  "error": "ConflictError",
  "message": "Não é o seu turno."
}
```

| Status HTTP | `error` | Significado |
| --- | --- | --- |
| `400` | `BadRequestError` | Payload inválido ou violação de regra de entrada (ex.: coordenadas ou frota inválida) |
| `401` | `UnauthorizedError` | Token JWT ausente, inválido ou expirado, ou falha de login |
| `403` | `ForbiddenError` | Usuário autenticado sem permissão para o recurso ou convidado offline |
| `404` | `NotFoundError` | Recurso ou rota não encontrada |
| `409` | `ConflictError` | Conflito de estado (disparo fora de turno, célula repetida, convite duplicado) |
| `410` | `GoneError` | Convite expirado |
| `500` | `InternalServerError` | Erro interno inesperado (registrado automaticamente no `AuditLog`) |
