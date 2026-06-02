import { Module } from '@nestjs/common';
import { CustomPagesController, PublicCustomPagesController } from './custom-pages.controller';
import { CustomPagesService } from './custom-pages.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomPagesController, PublicCustomPagesController],
  providers: [CustomPagesService],
})
export class CustomPagesModule {}
