import { StyledEngineProvider, ThemeProvider } from '@mui/material/styles';
import React from 'react';

import { AppBar, Tab, Tabs } from '@mui/material';

import {
    AdminConnection,
    GenericApp,
    I18n,
    Loader,
    type GenericAppProps,
    type GenericAppState,
    type IobTheme,
} from '@iobroker/adapter-react-v5';
import PersonsTab from './Tabs/Persons';
import OptionsTab from './Tabs/Options';

import enLang from './i18n/en.json';
import deLang from './i18n/de.json';
import ruLang from './i18n/ru.json';
import ptLang from './i18n/pt.json';
import nlLang from './i18n/nl.json';
import frLang from './i18n/fr.json';
import itLang from './i18n/it.json';
import esLang from './i18n/es.json';
import plLang from './i18n/pl.json';
import ukLang from './i18n/uk.json';
import zhCnLang from './i18n/zh-cn.json';
import type { FaceAdapterConfig } from './types';

declare global {
    interface Window {
        sentryDSN: string;
    }
}

const styles: Record<string, any> = {
    tabContent: {
        padding: 10,
        overflow: 'auto',
        height: 'calc(100% - 64px - 48px - 20px)',
    },
    tabContentNoSave: {
        padding: 10,
        height: 'calc(100% - 48px - 20px)',
        overflow: 'auto',
    },
    selected: (theme: IobTheme): React.CSSProperties => ({
        color: theme.palette.mode === 'dark' ? undefined : '#FFF !important',
    }),
    indicator: (theme: IobTheme): React.CSSProperties => ({
        backgroundColor: theme.palette.mode === 'dark' ? theme.palette.secondary.main : '#FFF',
    }),
};

interface AppState extends GenericAppState {
    alive: boolean;
    ready: boolean;
}

class App extends GenericApp<GenericAppProps, AppState> {
    private alert: null | ((_message?: string) => void);

    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppProps = { ...props };
        // @ts-expect-error no idea how to fix it
        extendedProps.Connection = AdminConnection;
        extendedProps.translations = {
            en: enLang,
            de: deLang,
            ru: ruLang,
            pt: ptLang,
            nl: nlLang,
            fr: frLang,
            it: itLang,
            es: esLang,
            pl: plLang,
            uk: ukLang,
            'zh-cn': zhCnLang,
        };

        extendedProps.sentryDSN = window.sentryDSN;
        // extendedProps.socket = {
        //     protocol: 'http:',
        //     host: '192.168.178.45',
        //     port: 8081,
        // };

        super(props, extendedProps);

        Object.assign(this.state, {
            selectedTab:
                window.localStorage.getItem(`${this.adapterName}.${this.instance}.selectedTab`) || 'controller',
            alive: false,
            ready: false,
        });

        this.alert = window.alert;
        window.alert = text => this.showToast(text);
    }

    async onConnectionReady(): Promise<void> {
        this.socket
            .subscribeState(`system.adapter.face.${this.instance}.alive`, this.onAlive)
            .catch(e => this.showError(`Cannot subscribe on system.adapter.face.${this.instance}.alive: ${e}`));

        const alive = await this.socket.getState(`system.adapter.face.${this.instance}.alive`);

        this.setState({
            ready: true,
            alive: !!alive?.val,
        });
    }

    onAlive = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (state?.val && !this.state.alive) {
            this.setState({ alive: true });
        } else if (!state?.val && this.state.alive) {
            this.setState({ alive: false });
        }
    };

    componentWillUnmount(): void {
        window.alert = this.alert as (_message?: any) => void;
        this.alert = null;

        try {
            this.socket.unsubscribeState(`system.adapter.face.${this.instance}.alive`, this.onAlive);
        } catch {
            // ignore
        }

        super.componentWillUnmount();
    }

    renderOptions(): React.ReactNode {
        if (!this.common) {
            return null;
        }

        return (
            <OptionsTab
                alive={this.state.alive}
                onChange={(id: string, value: any) => this.updateNativeValue(id, value)}
                onLoad={(native: Record<string, any>) => this.onLoadConfig(native)}
                socket={this.socket}
                common={this.common}
                native={this.state.native as FaceAdapterConfig}
                instance={this.instance}
                showToast={(text: string) => this.showToast(text)}
            />
        );
    }

    renderPersons(): React.ReactNode {
        if (!this.common) {
            return null;
        }

        return (
            <PersonsTab
                alive={this.state.alive}
                onChange={(id: string, value: any) => this.updateNativeValue(id, value)}
                onLoad={(native: Record<string, any>) => this.onLoadConfig(native)}
                socket={this.socket}
                common={this.common}
                native={this.state.native as FaceAdapterConfig}
                instance={this.instance}
                showToast={(text: string) => this.showToast(text)}
                themeType={this.state.themeType}
            />
        );
    }

    render(): React.JSX.Element {
        if (!this.state.ready) {
            return (
                <StyledEngineProvider injectFirst>
                    <ThemeProvider theme={this.state.theme}>
                        <Loader themeType={this.state.themeType} />
                    </ThemeProvider>
                </StyledEngineProvider>
            );
        }

        return (
            <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    {this.renderToast()}
                    <div
                        className="App"
                        style={{
                            background: this.state.theme.palette.background.default,
                            color: this.state.theme.palette.text.primary,
                        }}
                    >
                        <AppBar position="static">
                            <Tabs
                                value={this.state.selectedTab || 'options'}
                                onChange={(_e, value) => {
                                    this.setState({ selectedTab: value });
                                    window.localStorage.setItem(
                                        `${this.adapterName}.${this.instance}.selectedTab`,
                                        value,
                                    );
                                }}
                                scrollButtons="auto"
                                sx={{ '& .MuiTabs-indicator': styles.indicator }}
                            >
                                <Tab
                                    sx={{ '&.Mui-selected': styles.selected }}
                                    label={I18n.t('General')}
                                    value="options"
                                />
                                <Tab
                                    sx={{ '&.Mui-selected': styles.selected }}
                                    label={I18n.t('Persons')}
                                    value="persons"
                                />
                            </Tabs>
                        </AppBar>

                        <div style={this.state.selectedTab === 'options' ? styles.tabContent : styles.tabContentNoSave}>
                            {this.state.selectedTab === 'options' && this.renderOptions()}
                            {this.state.selectedTab === 'persons' && this.renderPersons()}
                        </div>
                        {this.renderError()}
                        {this.state.selectedTab === 'options' ? this.renderSaveCloseButtons() : null}
                    </div>
                </ThemeProvider>
            </StyledEngineProvider>
        );
    }
}

export default App;
