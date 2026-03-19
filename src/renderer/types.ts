export interface EmailMeta {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  dateObj: number;
  attachmentCount: number;
}

export interface Attachment {
  filename: string;
  contentType: string;
  data: string;
  encoding: string;
}

export interface EmailDetail {
  body: string;
  htmlBody: string;
  attachments: Attachment[];
}

export type Phase = 'empty' | 'loading' | 'no-selection' | 'detail';

declare global {
  interface Window {
    api: {
      openMboxFile: () => Promise<string | null>;
      readMbox: (filePath: string) => Promise<{ total?: number; error?: string }>;
      getEmailDetail: (id: string) => Promise<EmailDetail>;
      searchEmails: (params: {
        query: string;
        offset: number;
        limit: number;
        sortOrder: 'asc' | 'desc';
        excludeUnknown: boolean;
      }) => Promise<{ total: number; emails: EmailMeta[] }>;
      saveAttachment: (data: { filename: string; data: string }) => Promise<string>;
      onLoadProgress: (cb: (data: { percent: number; count: number }) => void) => void;
      offLoadProgress: () => void;
    };
  }
}
