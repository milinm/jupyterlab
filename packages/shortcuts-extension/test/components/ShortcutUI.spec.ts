/*
 * Copyright (c) Jupyter Development Team.
 * Distributed under the terms of the Modified BSD License.
 */
import { ShortcutUI } from '@jupyterlab/shortcuts-extension/lib/components';
import {
  IKeybinding,
  IShortcutTarget
} from '@jupyterlab/shortcuts-extension/lib/types';
import { CommandRegistry } from '@lumino/commands';
import { JSONValue, PromiseDelegate } from '@lumino/coreutils';
import { Signal } from '@lumino/signaling';
import {
  ISettingRegistry,
  SettingRegistry,
  Settings
} from '@jupyterlab/settingregistry';
import { IDataConnector } from '@jupyterlab/statedb';
import { nullTranslator } from '@jupyterlab/translation';
import { createRoot } from 'react-dom/client';
import React from 'react';

import pluginSchema from '../../schema/shortcuts.json';

const SHORTCUT_PLUGIN_ID = '@jupyterlab/shortcuts-extension:shortcuts';

class DummySettings extends Settings {
  constructor(protected options: Settings.IOptions) {
    super(options);
  }

  get plugin() {
    // By default this is taken from registry rather than options,
    // but using a single source of truth simplifies tests a lot.
    return this.options.plugin;
  }

  async set(key: string, value: JSONValue) {
    // Note: not setting `composite` for simplicity (we are only
    // interested in what happens to the `user` part here, because
    // generating `composite` is the responsibility of registry).
    this.options.plugin.data.user[key] = value;
  }
}

describe('@jupyterlab/shortcut-extension', () => {
  describe('ShortcutUI', () => {
    let shortcutUI: ShortcutUI;
    const data = {
      composite: { shortcuts: [] as CommandRegistry.IKeyBindingOptions[] },
      user: { shortcuts: [] as CommandRegistry.IKeyBindingOptions[] }
    };
    beforeEach(async () => {
      const commandRegistry = new CommandRegistry();
      data.composite.shortcuts.length = 0;
      data.user.shortcuts.length = 0;
      const plugin = {
        data,
        id: SHORTCUT_PLUGIN_ID,
        raw: '{}',
        schema: pluginSchema as any,
        version: 'test'
      };
      const connector: IDataConnector<ISettingRegistry.IPlugin, string> = {
        fetch: jest.fn(),
        list: jest.fn(),
        save: jest.fn(),
        remove: jest.fn()
      };
      const settings = new DummySettings({
        registry: new SettingRegistry({ connector }),
        plugin: plugin as any
      });
      const ready = new PromiseDelegate<void>();
      const element = React.createElement(ShortcutUI, {
        height: 1000,
        width: 1000,
        ref: el => {
          if (el) {
            shortcutUI = el;
            ready.resolve();
          }
        },
        external: {
          getSettings: async () => {
            return settings;
          },
          translator: nullTranslator,
          commandRegistry,
          actionRequested: new Signal<unknown, any>({})
        }
      });
      const rootElement = document.createElement('div');
      document.body.appendChild(rootElement);
      const root = createRoot(rootElement);
      root.render(element);
      await ready.promise;
    });

    const registerKeybinding = (
      shortcutTarget: IShortcutTarget,
      keybinding: IKeybinding
    ) => {
      const luminoKeybinding = {
        command: shortcutTarget.command,
        keys: keybinding.keys,
        selector: shortcutTarget.selector
      };
      if (keybinding.isDefault) {
        data.composite.shortcuts.push(luminoKeybinding);
      } else {
        data.user.shortcuts.push(luminoKeybinding);
      }
    };

    describe('#addKeybinding()', () => {
      it('should add a keybinding for given target', async () => {
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [],
          args: {},
          selector: 'body',
          category: 'test'
        };
        await shortcutUI.addKeybinding(target, ['Ctrl A', 'C']);
        expect(data.user.shortcuts).toHaveLength(1);
        expect(data.user.shortcuts[0]).toEqual({
          command: 'test:command',
          keys: ['Ctrl A', 'C'],
          selector: 'body'
        });
      });
    });

    describe('#replaceKeybinding()', () => {
      it('should replace a keybinding set by user', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: false
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        expect(data.user.shortcuts[0].keys).toEqual(['Ctrl A']);
        await shortcutUI.replaceKeybinding(target, keybinding, ['Ctrl X']);
        expect(data.user.shortcuts).toHaveLength(1);
        expect(data.user.shortcuts[0].keys).toEqual(['Ctrl X']);
      });

      it('should replace a default keybinding by disabling the default and adding a new one', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: true
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        await shortcutUI.replaceKeybinding(target, keybinding, ['Ctrl X']);
        expect(data.user.shortcuts).toHaveLength(2);
        expect(data.user.shortcuts[0]).toEqual({
          command: 'test:command',
          keys: ['Ctrl A'],
          selector: 'body',
          disabled: true
        });
        expect(data.user.shortcuts[1]).toEqual({
          command: 'test:command',
          keys: ['Ctrl X'],
          selector: 'body'
        });
      });
    });

    describe('#deleteKeybinding()', () => {
      it('should delete a default keybinding by disabling it', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: true
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        await shortcutUI.deleteKeybinding(target, keybinding);
        expect(data.user.shortcuts).toHaveLength(1);
        expect(data.user.shortcuts[0]).toEqual({
          command: 'test:command',
          keys: ['Ctrl A'],
          selector: 'body',
          disabled: true
        });
      });

      it('should remove a user keybinding by removing it from the list', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: false
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        await shortcutUI.deleteKeybinding(target, keybinding);
        expect(data.user.shortcuts).toHaveLength(0);
      });
    });

    describe('#resetKeybindings()', () => {
      it('should clear user overrides for given shortcut target', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: false
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        await shortcutUI.resetKeybindings(target);
        expect(data.user.shortcuts).toHaveLength(0);
      });

      it('should clear defaults overrides for given shortcut target', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: true
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        await shortcutUI.deleteKeybinding(target, keybinding);
        await shortcutUI.resetKeybindings(target);
        expect(data.user.shortcuts).toHaveLength(0);
      });

      it('should not touch user overrides for other shortcut targets', async () => {
        const keybinding = {
          keys: ['Ctrl A'],
          isDefault: false
        };
        const target = {
          id: 'test-id',
          command: 'test:command',
          keybindings: [keybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        const differentKeybinding = {
          keys: ['Ctrl A'],
          isDefault: false
        };
        const differentTarget = {
          id: 'different-test-id',
          command: 'test:different-command',
          keybindings: [differentKeybinding],
          args: {},
          selector: 'body',
          category: 'test'
        };
        registerKeybinding(target, keybinding);
        registerKeybinding(differentTarget, differentKeybinding);
        await shortcutUI.resetKeybindings(target);
        expect(data.user.shortcuts).toHaveLength(1);
      });
    });
  });
});
