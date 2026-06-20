// apps/api/src/modules/websocket/websocket.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { JobOrchestratorService } from '../queue/job-orchestrator.service';

@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly clientRooms = new Map<string, Set<string>>();

  constructor(private readonly orchestrator: JobOrchestratorService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    // Broadcast queue metrics every 5 seconds
    setInterval(async () => {
      try {
        const metrics = await this.orchestrator.getQueueMetrics();
        this.server.emit('queue:metrics', metrics);
      } catch {}
    }, 5000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.clientRooms.set(client.id, new Set());
    client.emit('connected', { id: client.id, ts: Date.now() });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clientRooms.delete(client.id);
  }

  // ─── Client subscriptions ───────────────────────────────
  @SubscribeMessage('subscribe:job')
  handleSubscribeJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { correlationId: string },
  ) {
    const room = `job:${data.correlationId}`;
    client.join(room);
    this.clientRooms.get(client.id)?.add(room);
    this.logger.debug(`${client.id} subscribed to ${room}`);
    return { success: true, room };
  }

  @SubscribeMessage('unsubscribe:job')
  handleUnsubscribeJob(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { correlationId: string },
  ) {
    const room = `job:${data.correlationId}`;
    client.leave(room);
    this.clientRooms.get(client.id)?.delete(room);
    return { success: true };
  }

  @SubscribeMessage('subscribe:domain')
  handleSubscribeDomain(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { domain: string },
  ) {
    const room = `domain:${data.domain}`;
    client.join(room);
    return { success: true, room };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { pong: true, ts: Date.now() };
  }

  // ─── Event listeners → WebSocket broadcast ──────────────
  @OnEvent('job:created')
  onJobCreated(payload: any) {
    this.server.emit('job:created', payload);
  }

  @OnEvent('job:progress')
  onJobProgress(payload: any) {
    if (payload.correlationId) {
      this.server.to(`job:${payload.correlationId}`).emit('job:progress', payload);
      this.server.emit('job:progress:broadcast', payload);
    }
  }

  @OnEvent('job:completed')
  onJobCompleted(payload: any) {
    if (payload.correlationId) {
      this.server.to(`job:${payload.correlationId}`).emit('job:completed', payload);
    }
    this.server.emit('job:completed:broadcast', payload);
  }

  @OnEvent('job:failed')
  onJobFailed(payload: any) {
    if (payload.correlationId) {
      this.server.to(`job:${payload.correlationId}`).emit('job:failed', payload);
    }
  }
}
