import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export interface Message {
  destinataires: string[];
  sujet: string;
  texte: string;
}

/**
 * Envoi de notifications (début de M0-F07 : le courriel ; SMS et
 * notifications dans l'application viendront ensuite).
 */
export abstract class Notificateur {
  abstract envoyer(message: Message): Promise<void>;
}

/** Courriel par SMTP ; sans serveur configuré, le message est seulement journalisé. */
@Injectable()
export class NotificateurCourriel extends Notificateur {
  private readonly journal = new Logger('Notifications');
  private readonly transport: Transporter | null;

  constructor(@Inject(CONFIGURATION) private readonly config: Configuration) {
    super();
    this.transport = config.SMTP_HOTE
      ? createTransport({
          host: config.SMTP_HOTE,
          port: config.SMTP_PORT,
          secure: config.SMTP_TLS_IMPLICITE,
          auth: config.SMTP_UTILISATEUR
            ? { user: config.SMTP_UTILISATEUR, pass: config.SMTP_MOT_DE_PASSE ?? '' }
            : undefined,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
      : null;
  }

  async envoyer(message: Message): Promise<void> {
    if (message.destinataires.length === 0) return;
    if (!this.transport) {
      this.journal.warn(`SMTP non configuré : « ${message.sujet} » non envoyé (${message.destinataires.length} destinataire(s)).`);
      return;
    }
    await this.transport.sendMail({
      from: this.config.EXPEDITEUR_COURRIEL,
      // Chaque destinataire en copie cachée : personne ne voit l'adresse des autres.
      bcc: message.destinataires,
      subject: message.sujet,
      text: message.texte,
    });
  }
}
