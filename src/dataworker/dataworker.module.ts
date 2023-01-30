import { Module } from "@nestjs/common";
import { DataworkerService } from "./dataworker.service";

@Module({
  providers: [DataworkerService],
  exports: [DataworkerService],
})
export class DataworkerModule {}
