import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { ScheduleModule } from "@nestjs/schedule";
import { AppService } from "./app.service";
import { UtilsModule } from "./utils/utils.module";
import { TasksModule } from "./tasks/tasks.module";
import { DataworkerModule } from "./dataworker/dataworker.module";
import { RelayerModule } from "./relayer/relayer.module";
import { ConfigureModule } from "./configure/configure.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [".env"],
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    UtilsModule,
    TasksModule,
    DataworkerModule,
    RelayerModule,
    ConfigureModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
