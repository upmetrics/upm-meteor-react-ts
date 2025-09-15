import Data from '../Data';
import call from '../Call';
import User from './User';
import { hashPassword } from '../lib/utils';
import Meteor from '../Meteor.js';

/**
 * Small locally-declared types to enable strict typing while keeping
 * the original runtime imports intact (we cast the imports to these shapes).
 */

type Callback = (err?: Error | string | null) => void;
type CallFunction = (method: string, ...args: unknown[]) => void;

interface CreateUserOptions {
  username?: string;
  email?: string;
  password: string | ReturnType<typeof hashPassword>;
  // allow extra fields preserved from original runtime object
  [key: string]: unknown;
}

interface ForgotPasswordOptions {
  email: string;
  [key: string]: unknown;
}

interface LoginResult {
  token?: string;
  [key: string]: unknown;
}

interface DataType {
  _tokenIdSaved?: boolean;
  on(event: 'onLogin' | 'onLoginFailure', cb: () => void): void;
}

interface UserType {
  _loginWithToken(token: string): void;
  _startLoggingIn(): void;
  _endLoggingIn(): void;
  _handleLoginCallback(err?: unknown, result?: unknown): void;
}

interface MeteorType {
  isVerbose(): boolean;
}

/* Cast the dynamic imports to the shapes we declared above so the rest of the file can be strictly typed. */
const callFn = call as unknown as CallFunction;
const DataService = Data as unknown as DataType;
const UserService = User as unknown as UserType;

function getMeteor() {
  return Meteor as unknown as MeteorType;
}

function info(msg: string): void {
  console.info(`Acc: ${msg}`);
}

class AccountsPassword {
  private _hashPassword = hashPassword;

  /**
   * Log in using a Meteor login token (e.g., from a previous session).
   * @param token - The Meteor login token
   * @param callback - Optional callback(err)
   */
  public loginWithToken(token: string, callback: Callback = () => {}): void {
    if (!token) {
      callback('Token is required');
      return;
    }
    try {
      UserService._loginWithToken(token);
      callback();
    } catch (err) {
      callback(err as Error | string);
    }
  }

  public createUser(options: CreateUserOptions, callback: Callback = () => {}): void {
    // Replace password with the hashed password if it's a plain string.
    if (typeof options.password === 'string') {
      options.password = this._hashPassword(options.password);
    }

    UserService._startLoggingIn();
    callFn('createUser', options, (err?: unknown, result?: unknown): void => {
      if (getMeteor().isVerbose()) {
        info(`Accounts.createUser::: err: ${String(err)}, result: ${String(result)}`);
      }
      UserService._endLoggingIn();
      UserService._handleLoginCallback(err, result);
      callback(err as Error | string | null);
    });
  }

  public changePassword(oldPassword: string | null, newPassword: string, callback: Callback = () => {}): void {
    // TODO check Meteor.user() to prevent if not logged

    if (typeof newPassword !== 'string' || !newPassword) {
      callback('Password may not be empty');
      return;
    }

    callFn(
      'changePassword',
      oldPassword ? this._hashPassword(oldPassword) : null,
      this._hashPassword(newPassword),
      (err?: unknown, res?: unknown): void => {
        callback(err as Error | string | null);
      }
    );
  }

  public forgotPassword(options: ForgotPasswordOptions, callback: Callback = () => {}): void {
    if (!options.email) {
      callback('Must pass options.email');
      return;
    }

    callFn('forgotPassword', options, (err?: unknown): void => {
      callback(err as Error | string | null);
    });
  }

  public resetPassword(token: string, newPassword: string, callback: Callback = () => {}): void {
    if (!newPassword) {
      callback('Must pass a new password');
      return;
    }

    callFn('resetPassword', token, this._hashPassword(newPassword), (err?: unknown, result?: LoginResult): void => {
        if (getMeteor().isVerbose()) {
        info(`Accounts.resetPassword::: err: ${String(err)}, result: ${String(result)}`);
      }

      if (!err && result && result.token) {
        UserService._loginWithToken(result.token);
      }

      callback(err as Error | string | null);
    });
  }

  public verifyEmail(token: string, cb?: Callback): void {
    if (!token) {
      if (typeof cb === 'function') return cb('Must pass a token');
      return;
    }

    callFn('verifyEmail', token, (err?: unknown, result?: LoginResult): void => {
      if (getMeteor().isVerbose()) {
        info(`Accounts.verifyEmail::: err: ${String(err)}, result: ${String(result)}`);
      }

      if (!err && result && result.token) {
        UserService._loginWithToken(result.token);
      }

      if (typeof cb === 'function') {
        cb(err as Error | string | null);
      }
    });
  }

  public onLogin(cb: () => void): void {
    if (DataService._tokenIdSaved) {
      cb();
      return;
    }
    DataService.on('onLogin', cb);
  }

  public onLoginFailure(cb: () => void): void {
    DataService.on('onLoginFailure', cb);
  }
}

export default new AccountsPassword();
