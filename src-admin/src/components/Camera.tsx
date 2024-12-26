import React from 'react';

import { Button, MenuItem, Select } from '@mui/material';

import { I18n } from '@iobroker/adapter-react-v5';

interface CameraProps {
    width: number;
    height: number;
    id: string;
}
interface CameraState {
    images: string[];
    selectedCamera: string;
    cameras: MediaDeviceInfo[] | null;
}

export class Camera extends React.Component<CameraProps, CameraState> {
    private readonly refVideo: React.RefObject<HTMLVideoElement>;
    private readonly refCanvas: React.RefObject<HTMLCanvasElement>;
    private context2: CanvasRenderingContext2D | null = null;
    private initialized = '';

    constructor(props: CameraProps) {
        super(props);
        this.refVideo = React.createRef();
        this.refCanvas = React.createRef();
        this.state = {
            images: [],
            selectedCamera: window.localStorage.getItem('selectedCamera') || '',
            cameras: null,
        };
    }

    async componentDidMount(): Promise<void> {
        await this.init();
    }

    static async getVideoDevices(): Promise<MediaDeviceInfo[]> {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'videoinput');
    }

    async init(): Promise<void> {
        let selectedCamera = this.state.selectedCamera;
        const cameras = this.state.cameras || (await Camera.getVideoDevices());
        if (!selectedCamera || !cameras.find(camera => camera.deviceId === selectedCamera)) {
            selectedCamera = cameras[0].deviceId;
        }

        if (this.refVideo.current && this.refCanvas.current && this.initialized !== selectedCamera) {
            this.context2 = this.context2 || this.refCanvas.current.getContext('2d');
            this.initialized = this.state.selectedCamera;

            this.setState({ cameras, selectedCamera }, async () => {
                if (typeof window.navigator.mediaDevices?.getUserMedia === 'function') {
                    this.refVideo.current!.srcObject = await window.navigator.mediaDevices.getUserMedia({
                        audio: false,
                        video: {
                            deviceId: this.state.selectedCamera,
                            facingMode: 'user',
                            height: { min: 480 },
                        },
                    });
                    this.refVideo.current!.onloadedmetadata = async () => {
                        await this.refVideo.current!.play();
                        console.log('Playing live media stream');
                    };
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
            this.context2.drawImage(this.refVideo.current, 0, 0, this.props.width, this.props.height);
            images.push(this.refCanvas.current.toDataURL('image/jpeg'));
            if (images.length > 4) {
                images.splice(0, images.length - 4);
            }
            this.setState({ images });
        }
    }

    render(): React.JSX.Element {
        return (
            <div
                style={{
                    width: '100%',
                    height: this.props.height + 48,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}
            >
                <div style={{ width: this.props.width, height: '100%' }}>
                    <Select
                        variant="standard"
                        disabled={!this.state.cameras}
                        value={this.state.selectedCamera}
                        onChange={e => {
                            this.setState({ selectedCamera: e.target.value }, async () => {
                                await this.init();
                            });
                        }}
                    >
                        {this.state.cameras?.map(camera => (
                            <MenuItem
                                key={camera.deviceId}
                                value={camera.deviceId}
                            >
                                {camera.deviceId}
                            </MenuItem>
                        ))}
                    </Select>
                    <video
                        playsInline
                        ref={this.refVideo}
                        autoPlay
                        width={this.props.width}
                        height={this.props.height}
                    ></video>
                    <Button onClick={() => this.takeSnapshot()}>{I18n.t('Screenshot')}</Button>
                </div>
                <canvas
                    style={{ opacity: 0, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
                    ref={this.refCanvas}
                    id={this.props.id}
                    width={this.props.width}
                    height={this.props.height}
                ></canvas>
                {this.state.images.map((image, i) => (
                    <img
                        key={i}
                        src={image}
                        alt="screenshot"
                    />
                ))}
            </div>
        );
    }
}
