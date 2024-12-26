import React from 'react';

import { Button, IconButton, MenuItem, Select, Checkbox, FormControlLabel } from '@mui/material';
import { Delete } from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';

interface CameraProps {
    width: number;
    height: number;
    id: string;
    onImagesUpdate: (images: string[]) => void;
    disabled?: boolean;
    verifyAllPersons?: boolean;
    onVerifyAllPersonsChanged?: (verifyAllPersons: boolean) => void;
}

interface CameraState {
    images: string[];
    selectedCamera: string;
    cameras: MediaDeviceInfo[] | null;
}

export class Camera extends React.Component<CameraProps, CameraState> {
    private readonly refVideo: React.RefObject<HTMLVideoElement>;
    private readonly refCanvas: React.RefObject<HTMLCanvasElement>;
    private readonly refOverlay: React.RefObject<HTMLDivElement>;
    private readonly refOverlayFrame: React.RefObject<HTMLDivElement>;
    private context2: CanvasRenderingContext2D | null = null;
    private initialized = '';
    private processInterval: ReturnType<typeof setInterval> | null = null;
    private noMotionTimer: ReturnType<typeof setTimeout> | null = null;
    private noActivityTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: CameraProps) {
        super(props);
        this.refVideo = React.createRef();
        this.refCanvas = React.createRef();
        this.refOverlay = React.createRef();
        this.refOverlayFrame = React.createRef();
        this.state = {
            images: [],
            selectedCamera: window.localStorage.getItem('selectedCamera') || '',
            cameras: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.init();
    }

    componentWillUnmount(): void {
        if (this.processInterval) {
            clearInterval(this.processInterval);
            this.processInterval = null;
        }
        if (this.noMotionTimer) {
            clearTimeout(this.noMotionTimer);
            this.noMotionTimer = null;
        }
        if (this.noActivityTimer) {
            clearTimeout(this.noActivityTimer);
            this.noActivityTimer = null;
        }
        if (this.refVideo.current) {
            this.refVideo.current.pause();
            this.refVideo.current.onloadedmetadata = null;
            this.refVideo.current.src = '';
            this.refVideo.current.load();
        }
    }

    static async getVideoDevices(): Promise<MediaDeviceInfo[]> {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const uniqueDevices: MediaDeviceInfo[] = [];
        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                if (!uniqueDevices.find(dev => dev.deviceId === device.deviceId)) {
                    uniqueDevices.push(device);
                }
            }
        });
        return uniqueDevices;
    }

    async init(): Promise<void> {
        let selectedCamera = this.state.selectedCamera === 'default' ? '' : this.state.selectedCamera;

        const cameras = this.state.cameras || (await Camera.getVideoDevices());
        if (!selectedCamera || !cameras.find(camera => camera.deviceId === selectedCamera)) {
            selectedCamera = cameras[0].deviceId;
        }

        if (this.refVideo.current && this.refCanvas.current && this.initialized !== selectedCamera) {
            if (this.refOverlay.current) {
                this.refOverlay.current.style.opacity = '0';
            }
            this.context2 = this.context2 || this.refCanvas.current.getContext('2d');
            this.initialized = this.state.selectedCamera;

            this.setState({ cameras, selectedCamera: selectedCamera || 'default' }, async () => {
                if (typeof window.navigator.mediaDevices?.getUserMedia === 'function') {
                    const stream = await window.navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            deviceId: selectedCamera,
                            facingMode: 'user',
                            height: { min: 480 },
                        },
                    });

                    if (stream) {
                        this.refVideo.current!.srcObject = stream;
                        this.refVideo.current!.onloadedmetadata = async () => {
                            if (this.refVideo.current) {
                                await this.refVideo.current.play();
                                console.log(
                                    `Playing live media stream: ${this.refVideo.current.clientWidth}x${this.refVideo.current.clientHeight}`,
                                );
                                if (this.refOverlayFrame.current && this.refOverlay.current) {
                                    this.refOverlay.current.style.opacity = '1';
                                    this.refOverlayFrame.current.style.width = `${Math.floor(
                                        (this.refOverlay.current.clientHeight * 480) / 640,
                                    )}px`;
                                }
                            }
                        };
                    }
                }
            });
        }
    }

    async componentDidUpdate(): Promise<void> {
        await this.init();
    }

    takeSnapshot(): void {
        if (this.refVideo.current && this.context2 && this.refCanvas.current) {
            const images = [...this.state.images];
            this.refCanvas.current.height = this.refVideo.current.clientHeight;
            this.refCanvas.current.width = Math.round((this.refVideo.current.clientHeight * 480) / 640);

            // We need portrait
            this.context2.drawImage(
                this.refVideo.current,
                (this.refCanvas.current.width - this.refVideo.current.clientWidth) / 2,
                0,
                this.refVideo.current.clientWidth,
                this.refVideo.current.clientHeight,
            );
            images.push(this.refCanvas.current.toDataURL('image/jpeg'));
            if (images.length > 4) {
                images.splice(0, images.length - 4);
            }
            this.setState({ images }, () => this.props.onImagesUpdate(this.state.images));
        }
    }

    renderImage(index: number): React.JSX.Element {
        return (
            <div
                key={index}
                style={{ position: 'relative', width: 200, borderRadius: 5 }}
            >
                <IconButton
                    style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        opacity: 0.7,
                    }}
                    disabled={!!this.props.disabled}
                    onClick={() => {
                        const images = [...this.state.images];
                        images.splice(index, 1);
                        this.setState({ images }, () => this.props.onImagesUpdate(this.state.images));
                    }}
                >
                    <Delete />
                </IconButton>

                <img
                    style={{ width: '100%', height: 'auto' }}
                    key={index}
                    src={this.state.images[index]}
                    alt="screenshot"
                />
            </div>
        );
    }

    render(): React.JSX.Element {
        return (
            <div
                style={{
                    width: '100%',
                    height: this.props.height + 48,
                    display: 'flex',
                    flexDirection: 'row',
                    gap: 8,
                }}
            >
                <canvas
                    style={{ opacity: 0, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                    ref={this.refCanvas}
                    id={this.props.id}
                    width={100}
                    height={100}
                ></canvas>
                <div style={{ width: this.props.width, height: '100%' }}>
                    <Select
                        fullWidth
                        style={{ marginBottom: 16 }}
                        variant="standard"
                        disabled={!this.state.cameras || !!this.props.disabled}
                        value={this.state.selectedCamera || 'default'}
                        onChange={e => {
                            this.setState({ selectedCamera: e.target.value || 'default' }, async () => {
                                await this.init();
                            });
                        }}
                    >
                        {this.state.cameras?.map(camera => (
                            <MenuItem
                                key={camera.deviceId || 'default'}
                                value={camera.deviceId || 'default'}
                            >
                                {camera.label || I18n.t('default')}
                            </MenuItem>
                        ))}
                    </Select>
                    <div style={{ position: 'relative' }}>
                        <video
                            playsInline
                            ref={this.refVideo}
                            autoPlay
                            style={{
                                zIndex: 0,
                                width: 480,
                            }}
                            // width={this.props.width}
                            // height={this.props.height}
                        ></video>
                        <div
                            ref={this.refOverlay}
                            style={{
                                position: 'absolute',
                                width: '100%',
                                height: 'calc(100% - 4px)',
                                top: 0,
                                left: 0,
                                zIndex: 1,
                            }}
                        >
                            <div
                                ref={this.refOverlayFrame}
                                style={{
                                    height: '100%',
                                    border: 'dashed 3px green',
                                    opacity: 0.5,
                                    boxSizing: 'border-box',
                                    margin: 'auto',
                                }}
                            ></div>
                        </div>
                    </div>
                </div>
                <div>
                    <div style={{ width: '100%' }}>
                        <Button
                            disabled={!!this.props.disabled}
                            onClick={() => this.takeSnapshot()}
                            variant="outlined"
                        >
                            {I18n.t('Screenshot')}
                        </Button>
                        {this.props.onVerifyAllPersonsChanged ? (
                            <FormControlLabel
                                style={{ marginLeft: 16 }}
                                control={
                                    <Checkbox
                                        disabled={!!this.props.disabled}
                                        checked={this.props.verifyAllPersons}
                                        onChange={() =>
                                            this.props.onVerifyAllPersonsChanged!(!this.props.verifyAllPersons)
                                        }
                                    />
                                }
                                label={I18n.t('Check all persons')}
                            />
                        ) : null}
                        {this.state.images.length ? (
                            <Button
                                disabled={!!this.props.disabled}
                                onClick={() => this.setState({ images: [] }, () => this.props.onImagesUpdate([]))}
                                variant="outlined"
                            >
                                {I18n.t('Clear all')}
                            </Button>
                        ) : null}
                    </div>

                    <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                        {this.state.images.map((_image, i) => this.renderImage(i))}
                    </div>
                </div>
            </div>
        );
    }
}
