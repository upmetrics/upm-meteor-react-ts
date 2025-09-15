import Data from '../Data';
import { hashPassword } from '../lib/utils';
import Mongo from '../Mongo';
import Meteor from '../Meteor.js';

const TOKEN_KEY = 'Meteor.loginToken';

interface UserRecord {
  _id: string;
  [key: string]: unknown;
}

interface DataInterface {
  _tokenIdSaved: string | null;
  notify(event: string): void;
}

interface LoginResult {
  token: string;
  id: string;
}

type MeteorCallback<T = any> = (err: Error | null, result?: T) => void;

interface MeteorInterface {
  call(method: string, callback: MeteorCallback): void;
  call<TParams>(method: string, params: TParams, callback: MeteorCallback): void;
  connect(): void;
  isVerbose(): boolean;
}

interface Collection<T> {
  findOne(id?: string | null): T | null;
}

interface MongoModule {
  Collection: new <T = any>(name: string) => Collection<T>;
}

/* Cast imports to the more specific interfaces used in this file */
const Users = (Mongo as unknown as MongoModule).Collection<UserRecord>
  ? new (Mongo as unknown as MongoModule).Collection<UserRecord>('users')
  : (new (Mongo as any).Collection('users') as Collection<UserRecord>);

const DataTyped = Data as unknown as DataInterface;

function getMeteor(): MeteorInterface {
  return Meteor as unknown as MeteorInterface;
}

function info(msg: string): void {
  console.info(`User: ${msg}`);
}

type LoginSelector = { username?: string } | { email?: string };

type LoginRequest =
  | { user: LoginSelector; password: string }
  | { resume: string }
  | Record<string, unknown>;

interface UserAPI {
  users: Collection<UserRecord>;
  user(): UserRecord | null;
  userId(): string | null;
  loggingIn(): boolean;
  logout(callback?: (err: Error | null) => void): void;
  handleLogout(): void;
  loginWithPassword(
    selector: string | LoginSelector,
    password: string,
    callback?: (err: Error | null) => void
  ): void;
  logoutOtherClients(callback?: (err: Error | null) => void): void;
  _login(user: LoginRequest, callback?: (err: Error | null) => void): void;
  _startLoggingIn(): void;
  _endLoggingIn(): void;
  _handleLoginCallback(err: Error | null, result?: LoginResult): void;
  _loginWithToken(value: string | null): void;
  getAuthToken(): string | null;
  _loadInitialUser(): Promise<void>;
  _isLoggingIn: boolean;
  _userIdSaved: string | null;
}

const User: UserAPI = {
  users: Users,
  _userIdSaved: null,
  _isLoggingIn: true,

  user(): UserRecord | null {
    if (!User._userIdSaved) {
      return null;
    }

    return Users.findOne(User._userIdSaved);
  },

  userId(): string | null {
    if (!User._userIdSaved) {
      return null;
    }

    const user = Users.findOne(User._userIdSaved);
    return (user && user._id) || null;
  },

  loggingIn(): boolean {
    return User._isLoggingIn;
  },

  logout(callback?: (err: Error | null) => void): void {
    getMeteor().call('logout', (err: Error | null) => {
      User.handleLogout();
      getMeteor().connect();

      if (typeof callback === 'function') {
        callback(err);
      }
    });
  },

  handleLogout(): void {
    localStorage.removeItem(TOKEN_KEY);
    DataTyped._tokenIdSaved = null;
    User._userIdSaved = null;
  },

  loginWithPassword(
    selector: string | LoginSelector,
    password: string,
    callback?: (err: Error | null) => void
  ): void {
    let sel: LoginSelector;
    if (typeof selector === 'string') {
      if (selector.indexOf('@') === -1) {
        sel = { username: selector };
      } else {
        sel = { email: selector };
      }
    } else {
      sel = selector;
    }

  User._startLoggingIn();
  getMeteor().call(
      'login',
      {
        user: sel,
        password: hashPassword(password),
      } as LoginRequest,
      (err: Error | null, result?: LoginResult) => {
        User._endLoggingIn();

        User._handleLoginCallback(err, result);

        if (typeof callback === 'function') {
          callback(err);
        }
      }
    );
  },

  logoutOtherClients(callback: (err: Error | null) => void = () => { }): void {
  getMeteor().call('getNewToken', (err: Error | null, res?: LoginResult) => {
      if (err) {
        return callback(err);
      }

      User._handleLoginCallback(err, res);

  getMeteor().call('removeOtherTokens', (err2: Error | null) => {
        callback(err2);
      });
    });
  },

  _login(user: LoginRequest, callback?: (err: Error | null) => void): void {
  User._startLoggingIn();
  getMeteor().call('login', user, (err: Error | null, result?: LoginResult) => {
      User._endLoggingIn();

      User._handleLoginCallback(err, result);

      if (typeof callback === 'function') {
        callback(err);
      }
    });
  },

  _startLoggingIn(): void {
    User._isLoggingIn = true;
    DataTyped.notify('loggingIn');
  },

  _endLoggingIn(): void {
    User._isLoggingIn = false;
    DataTyped.notify('loggingIn');
  },

  _handleLoginCallback(err: Error | null, result?: LoginResult): void {
    if (!err && result) {
  getMeteor().isVerbose() && info(`User._handleLoginCallback::: token: ${result.token} id: ${result.id}`);
      localStorage.setItem(TOKEN_KEY, result.token);
      DataTyped._tokenIdSaved = result.token;
      User._userIdSaved = result.id;
      DataTyped.notify('onLogin');
    } else {
  getMeteor().isVerbose() && info(`User._handleLoginCallback::: error: ${err?.message ?? err}`);
      DataTyped.notify('onLoginFailure');
      User.handleLogout();
    }
    DataTyped.notify('change');
  },

  _loginWithToken(value: string | null): void {
    DataTyped._tokenIdSaved = value;
    if (value !== null) {
  getMeteor().isVerbose() && info(`User._loginWithToken::: token: ${value}`);
      User._startLoggingIn();
  getMeteor().call('login', { resume: value } as LoginRequest, (err: Error | null, result?: LoginResult) => {
        User._endLoggingIn();
        User._handleLoginCallback(err, result);
      });
    } else {
  getMeteor().isVerbose() && info('User._loginWithToken::: token is null');
      User._endLoggingIn();
    }
  },

  getAuthToken(): string | null {
    return DataTyped._tokenIdSaved;
  },

  async _loadInitialUser(): Promise<void> {
    let value: string | null = null;
    try {
      // localStorage.getItem is synchronous but awaiting is harmless; type is string | null
      // keep behavior similar to original code
      value = await localStorage.getItem(TOKEN_KEY);
    } catch (error) {
      // Narrow error to Error for strict typing
      const err = error as Error;
      console.warn('LocalStorage error: ' + err.message);
    } finally {
      User._loginWithToken(value);
    }
  },
};

export default User;
