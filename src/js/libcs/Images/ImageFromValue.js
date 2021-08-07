import { images } from "Setup";

export function imageFromValue(val) {
    if (val.ctype === "image") {
        return val.value;
    }
    if (val.ctype === "string" && images.hasOwnProperty(val.value)) {
        return images[val.value].value;
    }
    return null;
}
