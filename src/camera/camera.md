

        function altitudeToZoom(altitude) {

            var A = 40487.57;

            var B = 0.00007096758;

            var C = 91610.74;

            var D = -40467.74;

            return Math.round(D + (A - D) / (1 + Math.pow(altitude / C, B)));

        }



        function zoomToAltitude(zoom) {

            var A = 40487.57;

            var B = 0.00007096758;

            var C = 91610.74;

            var D = -40467.74;

            return Math.round(C * Math.pow((A - D) / (zoom - D) - 1, 1 / B));

        }


function getZoomLevel(dis) {

    if (dis <= 100) {

        return 19;

    } else if (dis <= 300) {

        return 18;

    } else if (dis <= 660) {

        return 17;

    } else if (dis <= 1300) {

        return 16;

    } else if (dis <= 2600) {

        return 15;

    } else if (dis <= 6400) {

        return 14;

    } else if (dis <= 13200) {

        return 13;

    } else if (dis <= 26000) {

        return 12;

    } else if (dis <= 67985) {

        return 11;

    } else if (dis <= 139780) {

        return 10;

    } else if (dis <= 250600) {

        return 9;

    } else if (dis <= 380000) {

        return 8;

    } else if (dis <= 640000) {

        return 7;

    } else if (dis <= 1280000) {

        return 6;

    } else if (dis <= 2600000) {

        return 5;

    } else if (dis <= 6100000) {

        return 4;

    } else if (dis <= 11900000) {

        return 3;

    } else {

        return 2;

    }

}
