import { Module } from '@nestjs/common';
import { CustomPagesController } from './custom-pages.controller';
import { CustomPagesService } from './custom-pages.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomPagesController],
  providers: [CustomPagesService],
})
export class CustomPagesModule {}
