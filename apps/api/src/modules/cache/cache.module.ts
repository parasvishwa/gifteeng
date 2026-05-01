import { Global, Module } from "@nestjs/common";
import { CacheService } from "./cache.service";

/**
 * Global so any module can inject `CacheService` without re-importing
 * the module everywhere. Single shared client, lazy-connected at boot.
 */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
