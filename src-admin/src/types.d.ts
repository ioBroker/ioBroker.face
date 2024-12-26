export type FaceAdapterConfig = {
    engine: 'iobroker' | 'advanced';
    login: string;
    password: string;
    persons: { name: string }[];
};
