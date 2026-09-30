import { IsNumber, IsOptional, IsString } from "class-validator";


export class Create{
    @IsOptional()
    id?: number;

    @IsOptional()
    @IsString()
    name: string;

    @IsOptional()
    @IsNumber()
    size: number;

    @IsOptional()
    @IsString()
    colour: string;

    @IsOptional()
    @IsString()
    description: string;
}