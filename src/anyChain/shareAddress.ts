import {Share} from 'react-native';

/** Native: open the share sheet (which includes Copy). The web build uses shareAddress.web.ts. */
export const shareAddress = (text: string): Promise<unknown> => Share.share({message: text});
