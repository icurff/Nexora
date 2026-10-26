import {
  Global,
  Injectable,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createDatabaseOptions } from './config.js';

const dataSourceProvider = {
  provide: DataSource,
  useFactory: async () => {
    const dataSource = new DataSource(createDatabaseOptions());
    return dataSource.initialize();
  },
};

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dataSource.destroy();
  }
}

@Global()
@Module({
  providers: [dataSourceProvider, DatabaseShutdown],
  exports: [DataSource],
})
export class DatabaseModule {}
