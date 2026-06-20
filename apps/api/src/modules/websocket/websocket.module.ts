// apps/api/src/modules/websocket/websocket.module.ts
import { Module } from '@nestjs/common';
import { RealtimeGateway } from './websocket.gateway';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  providers: [RealtimeGateway],
})
export class WebsocketModule {}
