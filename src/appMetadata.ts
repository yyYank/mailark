const APP_NAME = 'mailark';

interface AppLike {
  setName(name: string): void;
}

export function applyAppMetadata(app: AppLike): void {
  app.setName(APP_NAME);
}
