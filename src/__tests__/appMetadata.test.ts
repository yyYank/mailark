import { applyAppMetadata } from '../appMetadata';

describe('applyAppMetadata', () => {
  test('アプリ名をmailarkに設定する', () => {
    const setName = jest.fn();

    applyAppMetadata({ setName });

    expect(setName).toHaveBeenCalledWith('mailark');
  });
});
