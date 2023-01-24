import { Module } from '@nestjs/common';
import { RelayerService } from './relayer.service';
import { TasksModule } from '../tasks/tasks.module';
import { ConfigureModule } from '../configure/configure.module';
import { DataworkerModule } from '../dataworker/dataworker.module';

@Module({
  imports: [TasksModule, DataworkerModule, ConfigureModule],
  providers: [RelayerService],
})
export class RelayerModule {}
