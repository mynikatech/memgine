import {
  Image as ReactNativeImage,
  ImageProps as ReactNativeImageProps,
} from "react-native";

export type ImageProps = ReactNativeImageProps;

export function Image(props: ImageProps) {
  return <ReactNativeImage {...props} />;
}
