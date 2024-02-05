import { Module } from "@nestjs/common";
import { ConfigureService } from "./configure.service";
import { BaseConfigService } from "./base.service";

@Module({
  providers: [ConfigureService, BaseConfigService],
  exports: [ConfigureService],
})
export class ConfigureModule {}
