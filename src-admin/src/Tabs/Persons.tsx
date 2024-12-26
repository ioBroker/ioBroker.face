import React, { Component } from 'react';

import {
    IconButton,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Table,
    TableRow,
    TableCell,
    TableHead,
    TableBody,
    Fab,
    CircularProgress,
    LinearProgress,
} from '@mui/material';

import { Check, Close, Delete, Person, Add, Edit, QuestionMark, Refresh } from '@mui/icons-material';

import { type AdminConnection, I18n, type ThemeType } from '@iobroker/adapter-react-v5';

import type { ENGINE, FaceAdapterConfig, PERSON_ID, TOKEN } from '../types';
import { Camera } from '../components/Camera';
import { Comm, type STATISTICS } from '../components/Comm';

const MAX_NAME_LENGTH = 48;
const MAX_ID_LENGTH = 16;

function validateToken(token: string): boolean {
    const payloadBase64 = token.split('.')[1];
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    try {
        const decodedJwt = JSON.parse(window.atob(base64));
        if (decodedJwt.exp !== undefined) {
            return new Date(decodedJwt.exp * 1000).getTime() > Date.now();
        }
    } catch {
        // ignore
    }
    return false;
}

const styles: Record<string, React.CSSProperties> = {
    address: {
        fontSize: 'smaller',
        opacity: 0.5,
        marginLeft: 8,
    },
    panel: {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
    },
    input: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
    inputLong: {
        marginTop: 2,
        marginBottom: 1,
        width: '100%',
        maxWidth: 500,
    },
    header: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 1,
    },
};

interface PersonsProps {
    alive: boolean;
    socket: AdminConnection;
    native: FaceAdapterConfig;
    common: ioBroker.InstanceCommon;
    instance: number;
    onChange: (attr: string, value: boolean | string) => void;
    showToast: (text: string) => void;
    onLoad: (native: Record<string, any>) => void;
    themeType: ThemeType;
}

interface PersonsState {
    showConfirmDialog: null | number;
    accessToken: TOKEN;
    refreshToken: TOKEN;
    showEnrollDialog: null | number;
    showVerifyDialog: null | number;
    persons: {
        name: string;
        id: string;
        iobroker?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
        advanced?: { enrolled: boolean; monthly: number; daily: number; lastTime: number };
    }[];
    stats: STATISTICS | null;
    images: string[];
    showEditDialog: null | number;
    editItem: { name: string; id: string } | null;
    processing: boolean;
    verifyResult: false | PERSON_ID | null;
    verifyAllPersons: boolean;
    detailedError: {
        error?: string;
        person?: PERSON_ID;
        // Results for each person
        results: { person: PERSON_ID; result: boolean; error?: string }[];
        // Errors for each image
        errors?: string[];
    } | null;
}

class Persons extends Component<PersonsProps, PersonsState> {
    constructor(props: PersonsProps) {
        super(props);
        this.state = {
            showConfirmDialog: null,
            accessToken: '',
            refreshToken: '',
            persons: [],
            showEnrollDialog: null,
            images: [],
            editItem: null,
            showEditDialog: null,
            showVerifyDialog: null,
            processing: false,
            verifyResult: null,
            verifyAllPersons: false,
            detailedError: null,
            stats: null,
        };
    }

    renderResultsDialog(): React.JSX.Element | null {
        if (this.state.verifyResult === null || this.state.showVerifyDialog === null) {
            return null;
        }
        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ verifyResult: null })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>{I18n.t('The result is')}</DialogTitle>
                <DialogContent>
                    <div
                        style={{
                            color: this.state.verifyResult
                                ? this.props.themeType === 'dark'
                                    ? '#7eff7e'
                                    : '#009e00'
                                : this.props.themeType === 'dark'
                                  ? '#ff7474'
                                  : '#880000',
                        }}
                    >
                        {this.state.verifyResult === false
                            ? this.state.persons.length > 1 && this.state.verifyAllPersons
                                ? I18n.t('Known person NOT found')
                                : I18n.t('Person is NOT %s', this.state.persons[this.state.showVerifyDialog].id)
                            : I18n.t('Detected person is "%s"', this.state.verifyResult)}
                    </div>
                    {this.state.detailedError?.results ? (
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{I18n.t('Person')}</TableCell>
                                    <TableCell>{I18n.t('Error')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {this.state.detailedError.results.map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{item.person}</TableCell>
                                        <TableCell>
                                            {I18n.t(item.error?.replace('Error: ', '') || 'Unknown error')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : null}
                    {this.state.detailedError?.error ? (
                        <div style={{ color: this.props.themeType === 'dark' ? '#ff7474' : '#880000' }}>
                            {I18n.t(this.state.detailedError.error)}
                        </div>
                    ) : null}
                    {this.state.detailedError?.errors ? (
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{I18n.t('Image')}</TableCell>
                                    <TableCell>{I18n.t('Error')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {this.state.detailedError.errors.map((item, i) => (
                                    <TableRow key={i}>
                                        <TableCell>{i}</TableCell>
                                        <TableCell>{item}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ verifyResult: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderEnrollDialog(): React.JSX.Element | null {
        if (this.state.showEnrollDialog === null) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showEnrollDialog: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {I18n.t('Enroll person')}
                    <span style={{ fontWeight: 'bold', marginLeft: 8 }}>
                        {this.state.persons[this.state.showEnrollDialog].id}
                        {this.state.persons[this.state.showEnrollDialog].name
                            ? ` (${this.state.persons[this.state.showEnrollDialog].name})`
                            : ''}
                    </span>
                </DialogTitle>
                <DialogContent>
                    <Camera
                        id="camera"
                        width={480}
                        height={640}
                        disabled={this.state.processing}
                        onImagesUpdate={(images: string[]): void => {
                            this.setState({ images });
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.images.length || this.state.processing}
                        onClick={async () => {
                            if (await this.validateTokens()) {
                                const engine: ENGINE = this.props.native.engine || 'iobroker';
                                await this.setStateAsync({ processing: true });
                                try {
                                    const result = await Comm.enroll(
                                        this.state.accessToken,
                                        engine,
                                        this.state.images,
                                        this.state.persons[this.state.showEnrollDialog as number].id,
                                    );
                                    if (result.enrolled) {
                                        await this.readPersons();
                                    }

                                    if (result.stats) {
                                        this.setState({
                                            showEnrollDialog: null,
                                            processing: false,
                                            stats: result.stats,
                                        });
                                    } else {
                                        this.setState({ showEnrollDialog: null, processing: false });
                                    }
                                } catch (e) {
                                    this.props.showToast(`${I18n.t('Cannot enroll')}: ${e.toString()}`);
                                    this.setState({ processing: false });
                                }
                            } else {
                                this.props.showToast(`${I18n.t('Cannot get access token')}`);
                            }
                        }}
                        startIcon={this.state.processing ? <CircularProgress size={20} /> : <Add />}
                    >
                        {I18n.t('Enroll')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={this.state.processing}
                        color="grey"
                        onClick={() => this.setState({ showEnrollDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    renderVerifyDialog(): React.JSX.Element | null {
        if (this.state.showVerifyDialog === null) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showVerifyDialog: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {this.state.persons.length > 1 && this.state.verifyAllPersons
                        ? I18n.t('Verify between all persons')
                        : I18n.t('Verify person')}
                    {this.state.persons.length > 1 && this.state.verifyAllPersons ? null : (
                        <span style={{ fontWeight: 'bold', marginLeft: 8 }}>
                            {this.state.persons[this.state.showVerifyDialog].id}
                            {this.state.persons[this.state.showVerifyDialog].name
                                ? ` (${this.state.persons[this.state.showVerifyDialog].name})`
                                : ''}
                        </span>
                    )}
                </DialogTitle>
                <DialogContent>
                    <Camera
                        id="camera"
                        width={480}
                        height={640}
                        disabled={this.state.processing}
                        verifyAllPersons={this.state.persons.length > 1 ? this.state.verifyAllPersons : undefined}
                        onVerifyAllPersonsChanged={
                            this.state.persons.length > 1
                                ? verifyAllPersons => this.setState({ verifyAllPersons })
                                : undefined
                        }
                        onImagesUpdate={(images: string[]): void => this.setState({ images })}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={!this.state.images.length || this.state.processing}
                        onClick={async () => {
                            if (await this.validateTokens()) {
                                await this.setStateAsync({ processing: true });
                                try {
                                    const result = await Comm.verify(
                                        this.state.accessToken,
                                        this.props.native.engine || 'iobroker',
                                        this.state.images,
                                        this.state.verifyAllPersons && this.state.persons.length > 1
                                            ? undefined
                                            : this.state.persons[this.state.showVerifyDialog as number].id,
                                    );
                                    if (
                                        result.person === this.state.persons[this.state.showVerifyDialog as number].id
                                    ) {
                                        if (result.stats) {
                                            this.setState({
                                                verifyResult: result.person,
                                                detailedError: null,
                                                stats: result.stats,
                                            });
                                        } else {
                                            this.setState({ verifyResult: result.person, detailedError: null });
                                        }
                                    } else if (result.stats) {
                                        this.setState({
                                            verifyResult: false,
                                            detailedError: result,
                                            stats: result.stats,
                                        });
                                    } else {
                                        this.setState({ verifyResult: false, detailedError: result });
                                    }
                                } catch (e) {
                                    this.props.showToast(`${I18n.t('Cannot verify')}: ${e.toString()}`);
                                }
                                this.setState({ processing: false });
                            } else {
                                this.props.showToast(`${I18n.t('Cannot get access token')}`);
                            }
                        }}
                        startIcon={this.state.processing ? <CircularProgress size={20} /> : <QuestionMark />}
                    >
                        {I18n.t('Verify')}
                    </Button>
                    <Button
                        variant="contained"
                        disabled={this.state.processing}
                        color="grey"
                        onClick={() => this.setState({ showVerifyDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Close')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    async onEditApply(): Promise<void> {
        if (await this.validateTokens()) {
            let count = 0;
            try {
                if (this.state.persons[this.state.showEditDialog as number]) {
                    count = await Comm.edit(
                        this.state.accessToken,
                        this.state.persons[this.state.showEditDialog as number].id,
                        this.state.editItem!,
                    );
                    if (count !== this.state.persons.length) {
                        await this.readPersons();
                        return;
                    }
                } else {
                    count = await Comm.add(this.state.accessToken, this.state.editItem!.id, this.state.editItem!);
                    if (count === this.state.persons.length) {
                        await this.readPersons();
                        return;
                    }
                }

                const persons = [...this.state.persons];
                persons[this.state.showEditDialog as number] = this.state.editItem!;
                this.setState({ persons, showEditDialog: null }, () => this.sendSync());
            } catch (e) {
                this.props.showToast(`${I18n.t('Cannot edit')}: ${e.toString()}`);
            }
        } else {
            this.props.showToast(`${I18n.t('Cannot get access token')}`);
        }
    }

    renderEditDialog(): React.JSX.Element | null {
        if (this.state.showEditDialog === null) {
            return null;
        }

        let idError = '';
        if (!this.state.editItem!.id) {
            idError = I18n.t('Empty ID is not allowed');
        } else if (this.state.editItem!.id.length > MAX_ID_LENGTH) {
            idError = I18n.t('ID is too long. Max %s characters', MAX_ID_LENGTH);
        } else if (this.state.editItem!.id.match(/[^a-z0-9]+/)) {
            idError = I18n.t('Only lowercase a-z and digits are allowed');
        } else {
            for (let i = 0; i < this.state.persons.length; i++) {
                if (i === this.state.showEditDialog) {
                    continue;
                }
                if (this.state.persons[i].id === this.state.editItem!.id) {
                    idError = I18n.t('ID must be unique');
                    break;
                }
            }
        }

        const changed =
            !this.state.persons[this.state.showEditDialog] ||
            this.state.persons[this.state.showEditDialog].id !== this.state.editItem!.id ||
            this.state.persons[this.state.showEditDialog].name !== this.state.editItem!.name;

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showEditDialog: null })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {I18n.t('Edit person')}
                    <span style={{ fontWeight: 'bold' }}>
                        {this.state.persons[this.state.showEditDialog]
                            ? this.state.persons[this.state.showEditDialog].id
                            : this.state.editItem!.id}
                    </span>
                </DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth
                        variant="standard"
                        label={I18n.t('ID')}
                        helperText={idError || I18n.t('Only a-z and 0-9 are allowed. Max %s characters', MAX_ID_LENGTH)}
                        error={!!idError}
                        value={this.state.editItem!.id}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                document.getElementById('name')?.focus();
                            }
                        }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            const editItem: { id: string; name: string } = {
                                ...(this.state.editItem || { id: '', name: '' }),
                            };
                            editItem.id = e.target.value.toLowerCase();
                            this.setState({ editItem });
                        }}
                    />
                    <TextField
                        id="name"
                        fullWidth
                        variant="standard"
                        label={I18n.t('Name')}
                        helperText={I18n.t('Max %s characters', MAX_NAME_LENGTH)}
                        error={this.state.editItem!.name.length > MAX_NAME_LENGTH}
                        value={this.state.editItem!.name}
                        onKeyDown={async e => {
                            if (
                                e.key === 'Enter' &&
                                this.state.editItem!.name.length < MAX_NAME_LENGTH &&
                                !idError &&
                                changed
                            ) {
                                await this.onEditApply();
                            }
                        }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
                            const editItem: { id: string; name: string } = {
                                ...(this.state.editItem || { id: '', name: '' }),
                            };
                            editItem.name = e.target.value;
                            this.setState({ editItem });
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="primary"
                        disabled={this.state.editItem!.name.length > MAX_NAME_LENGTH || !!idError || !changed}
                        onClick={() => this.onEditApply()}
                        startIcon={this.state.persons[this.state.showEditDialog] ? <Check /> : <Add />}
                    >
                        {this.state.persons[this.state.showEditDialog] ? I18n.t('Apply') : I18n.t('Add')}
                    </Button>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={() => this.setState({ showEditDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    async sendSync(): Promise<void> {
        if (this.props.alive) {
            await this.props.socket.sendTo(`face.${this.props.instance}`, 'sync', null);
        }
    }

    renderConfirmDialog(): React.JSX.Element | null {
        if (this.state.showConfirmDialog === null) {
            return null;
        }

        return (
            <Dialog
                open={!0}
                onClose={() => this.setState({ showConfirmDialog: null })}
                maxWidth="md"
            >
                <DialogTitle>{I18n.t('Please confirm')}</DialogTitle>
                <DialogContent>
                    {I18n.t(
                        'Do you really want to delete "%s"%s?',
                        this.state.persons[this.state.showConfirmDialog].id,
                        this.state.persons[this.state.showConfirmDialog].name
                            ? ` (${this.state.persons[this.state.showConfirmDialog].name})`
                            : '',
                    )}
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        color="grey"
                        onClick={async () => {
                            if (await this.validateTokens()) {
                                try {
                                    const length = await Comm.deletePerson(
                                        this.state.accessToken,
                                        this.state.persons[this.state.showConfirmDialog as number].id,
                                    );
                                    if (length !== this.state.persons.length - 1) {
                                        await this.readPersons();
                                        this.setState({ showConfirmDialog: null }, () => this.sendSync());
                                    } else {
                                        const persons = [...this.state.persons];
                                        persons.splice(this.state.showConfirmDialog as number, 1);
                                        this.setState({ persons, showConfirmDialog: null }, () => this.sendSync());
                                    }
                                } catch (e) {
                                    this.props.showToast(`${I18n.t('Cannot delete')}: ${e.toString()}`);
                                }
                            } else {
                                this.props.showToast(`${I18n.t('Cannot get access token')}`);
                            }
                        }}
                        startIcon={<Check />}
                    >
                        {I18n.t('Delete')}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => this.setState({ showConfirmDialog: null })}
                        startIcon={<Close />}
                    >
                        {I18n.t('Cancel')}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

    async componentDidMount(): Promise<void> {
        await this.readPersons();
        await this.props.socket.subscribeState(`face.${this.props.instance}.info.tokens`, this.onTokensChanged);
    }

    componentWillUnmount(): void {
        this.props.socket.unsubscribeState(`face.${this.props.instance}.info.tokens`);
    }

    async readPersons(): Promise<void> {
        await this.setStateAsync({ processing: true });
        await this.validateTokens();
        if (this.state.accessToken) {
            const result = await Comm.readPersons(this.state.accessToken);
            this.setState({ persons: result.persons, stats: result.stats, processing: false });
        } else {
            this.setState({ processing: false });
        }
    }

    onTokensChanged = (_id: string, state: ioBroker.State | null | undefined): void => {
        if (state?.val) {
            // try to parse
            try {
                const data = JSON.parse(state.val as string);
                if (
                    (data?.access_token || '') !== this.state.accessToken ||
                    (data?.refresh_token || '') !== this.state.refreshToken
                ) {
                    this.setState({ accessToken: data?.access_token || '', refreshToken: data?.refresh_token || '' });
                }
            } catch {
                if (this.state.accessToken || this.state.refreshToken) {
                    this.setState({ accessToken: '', refreshToken: '' });
                }
            }
        }
    };

    async setStateAsync(newState: Partial<PersonsState>): Promise<void> {
        return new Promise(resolve => this.setState(newState as PersonsState, () => resolve()));
    }

    async validateTokens(): Promise<boolean> {
        if (!this.state.accessToken) {
            const tokensVar = await this.props.socket.getState(`face.${this.props.instance}.info.tokens`);
            if (tokensVar?.val) {
                try {
                    const tokens: { access_token: string; refresh_token: string } = JSON.parse(tokensVar.val as string);
                    await this.setStateAsync({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
                    if (this.state.accessToken) {
                        return await this.validateTokens();
                    }
                } catch {
                    // ignore
                }
            }
        }

        if (this.state.accessToken && validateToken(this.state.accessToken)) {
            return true;
        }
        if (this.state.refreshToken && validateToken(this.state.refreshToken)) {
            try {
                // request new access token
                const tokens = await Comm.updateAccessToken(this.state.refreshToken);
                if (tokens.access_token && tokens.refresh_token) {
                    // save tokens
                    await this.props.socket.setState(
                        `face.${this.props.instance}.info.tokens`,
                        JSON.stringify(tokens),
                        true,
                    );
                    await this.setStateAsync({
                        accessToken: tokens?.access_token || '',
                        refreshToken: tokens?.refresh_token || '',
                    });
                    return true;
                }
            } catch (e) {
                this.props.showToast(`${I18n.t('Cannot authenticate')}: ${e.toString()}`);
            }
        }

        if (this.props.native.login && this.props.native.password) {
            try {
                // Get token
                const tokens = await Comm.token(this.props.native.login, this.props.native.password);
                await this.setStateAsync({
                    accessToken: tokens?.access_token || '',
                    refreshToken: tokens?.refresh_token || '',
                });
                await this.props.socket.setState(
                    `face.${this.props.instance}.info.tokens`,
                    JSON.stringify(tokens),
                    true,
                );
            } catch (e) {
                this.props.showToast(`${I18n.t('Cannot authenticate')}: ${e.toString()}`);
                await this.setStateAsync({ accessToken: '', refreshToken: '' });
            }
        } else {
            this.props.showToast(`${I18n.t('Cannot authenticate')}: ${I18n.t('no login or password defined')}`);
            await this.setStateAsync({ accessToken: '', refreshToken: '' });
        }
        return !!this.state.accessToken;
    }

    renderPerson(index: number): React.JSX.Element {
        return (
            <TableRow key={index}>
                <TableCell>{index + 1}</TableCell>
                <TableCell
                    title={
                        this.state.persons[index][this.props.native.engine || 'iobroker']
                            ? I18n.t('Enrolled')
                            : I18n.t('Must be enrolled')
                    }
                    style={{
                        color: this.state.persons[index][this.props.native.engine || 'iobroker']
                            ? this.props.themeType === 'dark'
                                ? '#72ff72'
                                : '#008500'
                            : undefined,
                    }}
                >
                    {this.state.persons[index].id}
                </TableCell>
                <TableCell>{this.state.persons[index].name}</TableCell>
                <TableCell style={{ width: 34 * 4 }}>
                    {this.state.persons[index][this.props.native.engine || 'iobroker'] ? (
                        <IconButton
                            size="small"
                            title={I18n.t('Test')}
                            disabled={!this.state.accessToken}
                            onClick={() => this.setState({ showVerifyDialog: index, images: [] })}
                        >
                            <QuestionMark />
                        </IconButton>
                    ) : (
                        <div style={{ width: 34, height: 5, display: 'inline-block' }} />
                    )}
                    <IconButton
                        size="small"
                        style={{ opacity: this.state.persons[index][this.props.native.engine] ? 0.5 : 1 }}
                        title={I18n.t('Enroll person')}
                        disabled={!this.state.accessToken}
                        onClick={() => this.setState({ showEnrollDialog: index, images: [] })}
                    >
                        <Person />
                    </IconButton>
                    <IconButton
                        size="small"
                        title={I18n.t('Edit person')}
                        disabled={!this.state.accessToken}
                        onClick={() =>
                            this.setState({ showEditDialog: index, editItem: { ...this.state.persons[index] } })
                        }
                    >
                        <Edit />
                    </IconButton>
                    <IconButton
                        size="small"
                        title={I18n.t('Delete person')}
                        disabled={!this.state.accessToken}
                        onClick={() => this.setState({ showConfirmDialog: index })}
                    >
                        <Delete />
                    </IconButton>
                </TableCell>
            </TableRow>
        );
    }

    render(): React.JSX.Element {
        const engine: ENGINE = this.props.native.engine || 'iobroker';
        const goodColor = this.props.themeType === 'dark' ? '#ceffce' : '#002700';
        const errorColor = this.props.themeType === 'dark' ? '#ff7474' : '#880000';

        return (
            <div style={styles.panel}>
                {this.state.processing ? (
                    <LinearProgress style={{ position: 'absolute', top: 0, left: 0, right: 0 }} />
                ) : null}
                {this.renderConfirmDialog()}
                {this.renderEnrollDialog()}
                {this.renderEditDialog()}
                {this.renderVerifyDialog()}
                {this.renderResultsDialog()}
                {this.state.stats ? (
                    <div>
                        <span style={{ color: this.state.stats.licenseTill < Date.now() ? errorColor : goodColor }}>
                            {this.state.stats.licenseTill
                                ? `${I18n.t('License valid till')}: ${this.state.stats.licenseTill - Date.now() < 72 * 3_600_000 ? new Date(this.state.stats.licenseTill).toLocaleString() : new Date(this.state.stats.licenseTill).toLocaleDateString()}`
                                : I18n.t('No valid license found')}
                            ,
                        </span>
                        <span
                            style={{
                                marginLeft: 8,
                                color:
                                    this.state.stats.usage[engine].monthly > this.state.stats.limits[engine].monthly
                                        ? errorColor
                                        : goodColor,
                            }}
                        >
                            {I18n.t('Monthly usage')}: {this.state.stats.usage[engine].monthly} /{' '}
                            {this.state.stats.limits[engine].monthly},
                        </span>
                        <span
                            style={{
                                marginLeft: 8,
                                color:
                                    this.state.stats.usage[engine].daily > this.state.stats.limits[engine].daily
                                        ? errorColor
                                        : goodColor,
                            }}
                        >
                            {I18n.t('Daily usage')}: {this.state.stats.usage[engine].daily} /{' '}
                            {this.state.stats.limits[engine].daily}
                        </span>
                    </div>
                ) : (
                    <div style={{ height: 21, width: 50 }} />
                )}
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell style={{ width: 64 }}>
                                <Fab
                                    title={I18n.t('Add new household person')}
                                    size="small"
                                    disabled={(this.state.persons?.length || 0) >= 10 || !this.state.accessToken}
                                    onClick={() =>
                                        this.setState({
                                            showEditDialog: this.state.persons.length,
                                            editItem: { id: '', name: '' },
                                        })
                                    }
                                >
                                    <Add />
                                </Fab>
                            </TableCell>
                            <TableCell>{I18n.t('ID')}</TableCell>
                            <TableCell>{I18n.t('Name')}</TableCell>
                            <TableCell style={{ textAlign: 'right' }}>
                                <IconButton
                                    title={I18n.t('Read from cloud again')}
                                    size="small"
                                    disabled={!this.state.accessToken}
                                    onClick={() => this.readPersons()}
                                >
                                    <Refresh />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>{this.state.persons.map((_person, i) => this.renderPerson(i))}</TableBody>
                </Table>
            </div>
        );
    }
}

export default Persons;
