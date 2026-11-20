import { DynamicModule, Global, Module } from '@nestjs/common';
import { CONFIGURATION, type Configuration } from './config/configuration';
import { SocleModule } from './socle.module';
import { TravauxModule } from './travaux/travaux.module';

@Global()
@Module({})
class ConfigurationModule {
  static avec(config: Configuration): DynamicModule {
    return {
      module: ConfigurationModule,
      providers: [{ provide: CONFIGURATION, useValue: config }],
      exports: [CONFIGURATION],
    };
  }
}

/** Module racine. La configuration est injectée, ce qui facilite les tests. */
@Module({})
export class AppModule {
  static avec(config: Configuration): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigurationModule.avec(config), SocleModule, TravauxModule],
    };
  }
}
